/**
 * Keyless DuckDuckGo engine: POSTs the no-JS HTML frontend and parses the
 * result links and snippets out of the markup. DuckDuckGo serves a bot-detection
 * challenge when it throttles datacenter or shared-egress IPs; that challenge is
 * surfaced as a failure so the chain falls through to the next engine.
 * @module
 */

import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

/** Registry id of the keyless DuckDuckGo engine. */
export const DUCKDUCKGO_PROVIDER_ID = 'duckduckgo'

const ENDPOINT = 'https://html.duckduckgo.com/html/'

/** Locale forwarded as DuckDuckGo's `kl` parameter. */
const DEFAULT_LOCALE = 'us-en'

/** Strip tags and decode the handful of entities DuckDuckGo's markup uses. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .trim()
}

/** Unwrap DuckDuckGo's `//duckduckgo.com/l/?uddg=<encoded>` redirect links. */
function targetUrl(href: string): string | undefined {
  const marker = 'uddg='
  const index = href.indexOf(marker)
  if (index === -1) return href.startsWith('http') ? href : undefined
  try {
    return decodeURIComponent(href.slice(index + marker.length).split('&')[0] ?? href)
  } catch {
    return undefined
  }
}

interface ParsedResult {
  readonly url: string
  readonly title: string
  readonly snippet: string | undefined
}

/** Parse result links in order, pairing each with the snippet that follows it. */
function parseResults(html: string): readonly ParsedResult[] {
  const snippets = [...html.matchAll(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map(m => textOf(m[1] ?? ''))
  const results: ParsedResult[] = []
  for (const match of html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = targetUrl(match[1] ?? '')
    const title = textOf(match[2] ?? '')
    if (url === undefined || title === '') continue
    results.push({ url, title, snippet: snippets[results.length] })
  }
  return results
}

/** Keyless DuckDuckGo engine for the fallback chain. */
export class DuckDuckGoProvider implements WebSearchProvider {
  readonly id = DUCKDUCKGO_PROVIDER_ID
  readonly title = 'DuckDuckGo'

  readonly description = {
    en: 'Free, no account or API key. Scrapes the DuckDuckGo HTML frontend, so it can be rate limited; no site filters.',
  }

  /** Keyless: always usable. */
  available(): boolean {
    return true
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const locale = /\blang:(\S+)/i.exec(request.query)?.[1] ?? DEFAULT_LOCALE
    const body = new URLSearchParams({ q: request.query, kl: locale })
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': 'text/html',
      },
      body: String(body),
      ...(signal === undefined ? {} : { signal }),
    })
    const html = await response.text()
    if (html.includes('anomaly-modal') || html.includes('If this error persists')) {
      throw new Error('duckduckgo served a bot-detection challenge for this network')
    }
    if (!response.ok) {
      throw new Error(`duckduckgo returned ${String(response.status)}`)
    }
    const sources: WebSearchSource[] = parseResults(html)
      .slice(0, request.maxResults ?? 10)
      .map(entry => ({
        url: entry.url,
        title: entry.title,
        ...(entry.snippet === undefined ? {} : { snippet: entry.snippet }),
      }))
    return { sources, truncated: false }
  }
}
