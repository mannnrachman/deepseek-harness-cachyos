import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearXNGProvider } from '../src/providers/searxng.ts'
import type { ResolvedChainConfig } from '../src/config.ts'

function configWith(endpoint: string | undefined): ResolvedChainConfig {
  return {
    enabled: true,
    order: ['searxng'],
    searxngEndpoint: endpoint,
    braveApiKey: undefined,
    tavilyApiKey: undefined,
    timeoutMs: 45_000,
  }
}

const SAMPLE_RESPONSE = {
  query: 'proof',
  results: [
    { title: 'Alpha', url: 'https://example.com/alpha', content: 'First snippet' },
    { title: 'Beta', url: 'https://example.com/beta', snippet: 'Second snippet ', published_date: '2026-01-02' },
    { url: '' },
    { title: 'No url is skipped' },
  ],
  answers: ['42 is the answer'],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searxng engine', () => {
  it('queries format=json and maps results, snippets and answers', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) =>
      new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const provider = new SearXNGProvider(configWith('https://searx.example.org/'))
    const result = await provider.search({ query: 'proof', maxResults: 2 })

    const call = fetchMock.mock.calls[0]
    expect(call?.[0].toString()).toBe('https://searx.example.org/search?q=proof&format=json&pageno=1')
    expect(call?.[1]?.headers).toEqual({ accept: 'application/json' })
    expect(result.truncated).toBe(false)
    expect(result.content).toBe('42 is the answer')
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]).toEqual({ url: 'https://example.com/alpha', title: 'Alpha', snippet: 'First snippet' })
    expect(result.sources[1]?.url).toBe('https://example.com/beta')
    expect(result.sources[1]?.snippet).toBe('Second snippet')
    expect(result.sources[1]?.publishedAt).toBe('2026-01-02')
  })

  it('returns empty sources without throwing on an empty result page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })))
    const provider = new SearXNGProvider(configWith('https://searx.example.org'))
    const result = await provider.search({ query: 'proof' })
    expect(result.sources).toEqual([])
    expect(result.truncated).toBe(false)
    expect(result.content).toBeUndefined()
  })

  it('raises plain HTTP failures for the chain to record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })))
    const provider = new SearXNGProvider(configWith('https://searx.example.org'))
    await expect(provider.search({ query: 'proof' })).rejects.toThrow(/searxng returned 403: forbidden/)
  })

  it('is unavailable and refuses to search without an endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network must not be touched')
    }))
    const provider = new SearXNGProvider(configWith(undefined))
    expect(provider.available()).toBe(false)
    await expect(provider.search({ query: 'proof' })).rejects.toThrow(/SEARXNG_ENDPOINT/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards the abort signal to the transport', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('The search was aborted.', 'AbortError')
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new SearXNGProvider(configWith('https://searx.example.org'))
    controller.abort()
    await expect(provider.search({ query: 'proof' }, controller.signal)).rejects.toThrow()
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })
})
