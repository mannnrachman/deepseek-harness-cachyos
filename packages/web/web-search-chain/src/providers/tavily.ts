/**
 * Tavily engine: POSTs the agent-focused search API and maps structured
 * results plus the synthesized answer into the unified chain shape. A missing
 * API key keeps the engine unavailable; an empty result page returns empty
 * sources so the chain falls through instead of failing.
 * @module
 */

import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { redactSecrets, type ResolvedChainConfig } from '../config.ts'

/** Registry id of the Tavily engine. */
export const TAVILY_PROVIDER_ID = 'tavily'

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const DEFAULT_NUM_RESULTS = 5

/** The response fields this adapter reads; Tavily may omit either. */
interface TavilySearchResponse {
  answer?: unknown
  results?: unknown
}

/** The result fields this adapter reads; Tavily may omit any of them. */
interface TavilyResult {
  url?: unknown
  title?: unknown
  content?: unknown
  published_date?: unknown
}

/** Pull a human-readable message out of Tavily error payloads. */
function errorDetail(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload.trim() || undefined
  if (typeof payload !== 'object' || payload === null) return undefined
  const candidate = 'detail' in payload
    ? payload.detail
    : 'error' in payload
      ? payload.error
      : 'message' in payload
        ? payload.message
        : undefined
  return errorDetail(candidate)
}

/** The non-blank string a field holds, or undefined. */
function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** Parse a JSON document, or undefined when the text is not one. */
function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed
  } catch {
    return undefined
  }
}

/** Map Tavily's result list into chain sources, skipping entries without a URL. */
function parseSources(results: unknown): readonly WebSearchSource[] {
  const entries: readonly unknown[] = Array.isArray(results) ? results : []
  const sources: WebSearchSource[] = []
  for (const entry of entries) {
    const result: TavilyResult = typeof entry === 'object' && entry !== null ? entry : {}
    const url = textOf(result.url)
    if (url === undefined) continue
    const title = textOf(result.title)
    const snippet = textOf(result.content)
    const publishedAt = typeof result.published_date === 'string' ? result.published_date : undefined
    sources.push({
      url,
      title: title ?? url,
      ...(snippet === undefined ? {} : { snippet }),
      ...(publishedAt === undefined ? {} : { publishedAt }),
    })
  }
  return sources
}

/** Tavily engine for the fallback chain. */
export class TavilyProvider implements WebSearchProvider {
  readonly id = TAVILY_PROVIDER_ID
  readonly title = 'Tavily'

  readonly description = {
    en: 'Tavily Search API, built for AI agents. Needs a free API key (1,000 queries/month).',
  }

  constructor(private readonly config: ResolvedChainConfig) {}

  /** Cheap local check: the API key must be configured. */
  available(): boolean {
    return this.config.tavilyApiKey !== undefined
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const apiKey = this.config.tavilyApiKey
    if (apiKey === undefined) {
      throw new Error('tavily api key is missing (set TAVILY_API_KEY)')
    }
    const maxResults = request.maxResults ?? DEFAULT_NUM_RESULTS
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: request.query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: 'advanced',
        include_raw_content: false,
      }),
      ...(signal === undefined ? {} : { signal }),
    })
    if (!response.ok) {
      const text = (await response.text()).trim()
      const detail = text === '' ? response.statusText : errorDetail(parseJson(text)) ?? text
      const shown = redactSecrets(detail, [apiKey])
      throw new Error(`tavily returned ${String(response.status)}${shown === '' ? '' : `: ${shown}`}`)
    }

    const payload = (await response.json()) as TavilySearchResponse
    const answer = textOf(payload.answer)?.trim()
    return {
      ...(answer === undefined ? {} : { content: answer }),
      sources: parseSources(payload.results).slice(0, maxResults),
      truncated: false,
    }
  }
}
