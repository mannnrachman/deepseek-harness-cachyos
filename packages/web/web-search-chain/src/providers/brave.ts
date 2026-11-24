/**
 * Brave Search engine: GETs the web-search REST endpoint with the configured
 * subscription token and maps `web.results` into chain sources (description
 * plus any extra snippets as the excerpt). Keyed engine: without a Brave API
 * key it stays out of the candidate list, and HTTP failures are raised as
 * plain errors so the chain records them and falls through.
 * @module
 */

import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { redactSecrets, type ResolvedChainConfig } from '../config.ts'

/** Registry id of the Brave engine. */
export const BRAVE_PROVIDER_ID = 'brave'

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

/** Brave serves 1..20 results per request; engines default to 10. */
const DEFAULT_COUNT = 10
const MAX_COUNT = 20
const MAX_QUERY_CHARACTERS = 500
const MAX_SNIPPET_CHARS = 8_000

/** Subset of the Brave web-search response this engine reads. */
interface BraveResponse {
  readonly web?: { readonly results?: readonly unknown[] }
}

/** Strip markup, collapse whitespace and cap the length with an ellipsis. */
function textOf(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (text === '') return undefined
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

/** Accept only plain http(s) URLs of a sane length as result targets. */
function urlOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** Combine the description with any extra snippets Brave returned, deduped. */
function snippetOf(result: Record<string, unknown>): string | undefined {
  const pieces = new Set<string>()
  const description = textOf(result.description, MAX_SNIPPET_CHARS)
  if (description !== undefined) pieces.add(description)
  if (Array.isArray(result.extra_snippets)) {
    for (const extra of result.extra_snippets) {
      const text = textOf(extra, MAX_SNIPPET_CHARS)
      if (text !== undefined) pieces.add(text)
    }
  }
  const combined = [...pieces].join('\n')
  if (combined === '') return undefined
  return combined.length <= MAX_SNIPPET_CHARS ? combined : `${combined.slice(0, MAX_SNIPPET_CHARS - 1)}…`
}

/** Map the ranked `web.results` entries into chain sources. */
function parseSources(response: BraveResponse, count: number): readonly WebSearchSource[] {
  const results = response.web?.results
  if (!Array.isArray(results)) return []
  const sources: WebSearchSource[] = []
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) continue
    const result = entry as Record<string, unknown>
    const url = urlOf(result.url)
    if (url === undefined) continue
    const snippet = snippetOf(result)
    const publishedAt = textOf(result.age, 100)
    sources.push({
      url,
      title: textOf(result.title, 300) ?? url,
      ...(snippet === undefined ? {} : { snippet }),
      ...(publishedAt === undefined ? {} : { publishedAt }),
    })
  }
  return sources.slice(0, count)
}

/** Brave Search engine for the fallback chain. */
export class BraveProvider implements WebSearchProvider {
  readonly id = BRAVE_PROVIDER_ID
  readonly title = 'Brave Search'

  readonly description = {
    en: 'Brave Search API. High-quality independent index; needs a free API key (2,000 queries/month).',
  }

  constructor(private readonly config: ResolvedChainConfig) {}

  /** Usable only when a subscription token is configured (local check only). */
  available(): boolean {
    return this.config.braveApiKey !== undefined
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const apiKey = this.config.braveApiKey
    if (apiKey === undefined) throw new Error('brave engine has no API key configured')
    if (request.query.length > MAX_QUERY_CHARACTERS) {
      throw new Error(`brave search queries cannot exceed ${String(MAX_QUERY_CHARACTERS)} characters`)
    }
    const count = Math.min(Math.max(Math.floor(request.maxResults ?? DEFAULT_COUNT), 1), MAX_COUNT)
    const url = new URL(ENDPOINT)
    url.searchParams.set('q', request.query)
    url.searchParams.set('count', String(count))
    url.searchParams.set('extra_snippets', 'true')
    url.searchParams.set('text_decorations', 'false')
    url.searchParams.set('safesearch', 'moderate')
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-subscription-token': apiKey,
      },
      ...(signal === undefined ? {} : { signal }),
    })
    const body = await response.text()
    if (!response.ok) {
      const detail = redactSecrets(body.trim().slice(0, 200), [apiKey])
      throw new Error(`brave returned ${String(response.status)}${detail === '' ? '' : `: ${detail}`}`)
    }
    let data: BraveResponse
    try {
      data = JSON.parse(body) as BraveResponse
    } catch {
      throw new Error('brave returned invalid JSON')
    }
    return { sources: parseSources(data, count), truncated: false }
  }
}
