import { afterEach, describe, expect, it, vi } from 'vitest'
import { TavilyProvider } from '../src/providers/tavily.ts'
import type { ResolvedChainConfig } from '../src/config.ts'

function configWith(apiKey: string | undefined): ResolvedChainConfig {
  return {
    enabled: true,
    order: ['tavily'],
    searxngEndpoint: undefined,
    braveApiKey: undefined,
    tavilyApiKey: apiKey,
    timeoutMs: 45_000,
  }
}

const SAMPLE_RESPONSE = {
  answer: '  Synthesized answer  ',
  request_id: 'req-1',
  results: [
    { title: 'Alpha', url: 'https://example.com/alpha', content: 'First content', published_date: '2026-01-02' },
    { title: '', url: 'https://example.com/beta' },
    { url: '' },
    'not-an-object',
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tavily engine', () => {
  it('posts the documented body and maps answer plus results', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const provider = new TavilyProvider(configWith('tvly-key'))
    const result = await provider.search({ query: 'proof', maxResults: 2 })

    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe('https://api.tavily.com/search')
    expect(call?.[1]?.method).toBe('POST')
    expect(call?.[1]?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer tvly-key' })
    expect(JSON.parse(call?.[1]?.body as string)).toEqual({
      query: 'proof',
      search_depth: 'basic',
      max_results: 2,
      include_answer: 'advanced',
      include_raw_content: false,
    })
    expect(result.truncated).toBe(false)
    expect(result.content).toBe('Synthesized answer')
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]).toEqual({
      url: 'https://example.com/alpha',
      title: 'Alpha',
      snippet: 'First content',
      publishedAt: '2026-01-02',
    })
    expect(result.sources[1]?.title).toBe('https://example.com/beta')
    expect(result.sources[1]?.snippet).toBeUndefined()
  })

  it('returns empty sources without throwing when no results come back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ answer: '', results: [] }), { status: 200 })))
    const provider = new TavilyProvider(configWith('tvly-key'))
    const result = await provider.search({ query: 'proof' })
    expect(result.sources).toEqual([])
    expect(result.content).toBeUndefined()
    expect(result.truncated).toBe(false)
  })

  it('extracts the API error detail from JSON failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'Invalid API key' }), { status: 401 }),
    ))
    const provider = new TavilyProvider(configWith('tvly-key'))
    await expect(provider.search({ query: 'proof' })).rejects.toThrow(/tavily returned 401: Invalid API key/)
  })

  it('never surfaces the API key when an error body echoes it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'rejected key tvly-key' }), { status: 403 }),
    ))
    const provider = new TavilyProvider(configWith('tvly-key'))
    const failure = await provider.search({ query: 'proof' }).catch((error: unknown) => error)
    if (!(failure instanceof Error)) throw new Error('expected the search to fail')
    expect(failure.message).toContain('[redacted]')
    expect(failure.message).not.toContain('tvly-key')
  })

  it('is unavailable and refuses to search without an API key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network must not be touched')
    }))
    const provider = new TavilyProvider(configWith(undefined))
    expect(provider.available()).toBe(false)
    await expect(provider.search({ query: 'proof' })).rejects.toThrow(/TAVILY_API_KEY/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
