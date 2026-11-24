/**
 * SearXNG engine: GETs the instance's JSON search API and maps results into
 * the unified chain shape. A missing endpoint keeps the engine unavailable;
 * an empty result page returns empty sources so the chain falls through
 * instead of failing. Reference: https://docs.searxng.org/dev/search_api.html
 * @module
 */

import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import type { ResolvedChainConfig } from '../config.ts'

/** Registry id of the SearXNG engine. */
export const SEARXNG_PROVIDER_ID = 'searxng'

const DEFAULT_NUM_RESULTS = 10

/** SearXNG JSON API response types (subset we consume). */
interface SearXNGResult {
  title?: string
  url?: string
  content?: string
  snippet?: string
  publishedDate?: string
  published_date?: string
}

interface SearXNGResponse {
  results?: SearXNGResult[]
  answers?: unknown[]
}

/** Displayable text from string answers and structured answer plugins. */
function answerText(answers: unknown[] | undefined): string | undefined {
  const texts: string[] = []
  for (const answer of answers ?? []) {
    if (typeof answer === 'string') {
      if (answer.trim() !== '') texts.push(answer.trim())
    } else if (typeof answer === 'object' && answer !== null && 'answer' in answer && typeof answer.answer === 'string') {
      const text = answer.answer.trim()
      if (text !== '') texts.push(text)
    }
    if (texts.length === 3) break
  }
  return texts.length > 0 ? texts.join('\n\n') : undefined
}

/** SearXNG engine for the fallback chain. */
export class SearXNGProvider implements WebSearchProvider {
  readonly id = SEARXNG_PROVIDER_ID
  readonly title = 'SearXNG'

  readonly description = {
    en: 'Self-hosted SearXNG instance. Free and private; quality depends on the instance.',
  }

  constructor(private readonly config: ResolvedChainConfig) {}

  /** Cheap local check: the instance endpoint must be configured. */
  available(): boolean {
    return this.config.searxngEndpoint !== undefined
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const endpoint = this.config.searxngEndpoint
    if (endpoint === undefined) {
      throw new Error('searxng endpoint is missing (set SEARXNG_ENDPOINT)')
    }
    const url = new URL(`${endpoint.replace(/\/+$/, '')}/search`)
    url.searchParams.set('q', request.query)
    url.searchParams.set('format', 'json')
    if (request.maxResults !== undefined) {
      url.searchParams.set('pageno', '1')
    }

    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    })
    if (!response.ok) {
      const detail = (await response.text()).trim()
      throw new Error(`searxng returned ${String(response.status)}${detail === '' ? '' : `: ${detail}`}`)
    }
    let payload: SearXNGResponse
    try {
      payload = (await response.json()) as SearXNGResponse
    } catch {
      throw new Error(`searxng returned invalid JSON for ${url.searchParams.get('q') ?? request.query}`)
    }

    const sources: WebSearchSource[] = []
    for (const result of payload.results ?? []) {
      if (result.url === undefined || result.url === '') continue
      const publishedAt = result.publishedDate ?? result.published_date
      const snippet = (result.content ?? result.snippet)?.trim() || undefined
      sources.push({
        url: result.url,
        title: result.title ?? result.url,
        ...(snippet === undefined ? {} : { snippet }),
        ...(publishedAt === undefined ? {} : { publishedAt }),
      })
    }

    const content = answerText(payload.answers)
    return {
      ...(content === undefined ? {} : { content }),
      sources: sources.slice(0, request.maxResults ?? DEFAULT_NUM_RESULTS),
      truncated: false,
    }
  }
}
