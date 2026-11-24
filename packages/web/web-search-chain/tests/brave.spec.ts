import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedChainConfig } from '../src/config.ts'
import { BraveProvider } from '../src/providers/brave.ts'

const SAMPLE_RESPONSE = {
  web: {
    results: [
      {
        url: 'https://example.com/alpha',
        title: 'Alpha <b>result</b>',
        description: 'First  description here',
        age: '2 days ago',
        extra_snippets: ['First  description here', 'Extra   snippet'],
      },
      { url: 'not-a-url', title: 'Skipped: malformed URL' },
      { url: 'ftp://example.com/nope', title: 'Skipped: non-http scheme' },
      { url: 'https://example.com/beta', title: 'Beta result', description: 'Second description' },
      { url: 'https://example.com/gamma' },
      { url: 'https://example.com/delta', title: 'Delta result', description: 'Fourth description' },
    ],
  },
}

function chainConfig(braveApiKey?: string): ResolvedChainConfig {
  return {
    enabled: true,
    order: ['brave'],
    searxngEndpoint: undefined,
    braveApiKey,
    tavilyApiKey: undefined,
    timeoutMs: 45_000,
  }
}

interface CapturedCall {
  readonly url: URL
  readonly init: RequestInit | undefined
}

function stubFetch(status = 200, body = JSON.stringify(SAMPLE_RESPONSE)): readonly CapturedCall[] {
  const calls: CapturedCall[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: typeof url === 'string' ? new URL(url) : url, init })
    return new Response(body, { status, headers: { 'content-type': 'application/json' } })
  }))
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('brave engine', () => {
  it('sends the documented request and maps web.results into sources', async () => {
    const calls = stubFetch()
    const provider = new BraveProvider(chainConfig('brave-key'))
    const result = await provider.search({ query: 'proof', maxResults: 3 })

    expect(result.truncated).toBe(false)
    expect(result.content).toBeUndefined()
    expect(calls).toHaveLength(1)
    const { url, init } = calls[0]!
    expect(url.origin + url.pathname).toBe('https://api.search.brave.com/res/v1/web/search')
    expect(url.searchParams.get('q')).toBe('proof')
    expect(url.searchParams.get('extra_snippets')).toBe('true')
    expect(init?.headers).toMatchObject({ 'x-subscription-token': 'brave-key' })

    expect(result.sources).toHaveLength(3)
    expect(result.sources[0]).toEqual({
      url: 'https://example.com/alpha',
      title: 'Alpha result',
      snippet: 'First description here\nExtra snippet',
      publishedAt: '2 days ago',
    })
    expect(result.sources[1]).toEqual({
      url: 'https://example.com/beta',
      title: 'Beta result',
      snippet: 'Second description',
    })
    expect(result.sources[2]).toEqual({ url: 'https://example.com/gamma', title: 'https://example.com/gamma' })
  })

  it('clamps the result count into the 1..20 window Brave accepts', async () => {
    const calls = stubFetch()
    const provider = new BraveProvider(chainConfig('brave-key'))
    await provider.search({ query: 'proof', maxResults: 50 })
    await provider.search({ query: 'proof', maxResults: 0 })
    await provider.search({ query: 'proof' })
    expect(calls[0]?.url.searchParams.get('count')).toBe('20')
    expect(calls[1]?.url.searchParams.get('count')).toBe('1')
    expect(calls[2]?.url.searchParams.get('count')).toBe('10')
  })

  it('raises plain HTTP failures with the response body for the chain', async () => {
    stubFetch(429, 'quota exceeded')
    const provider = new BraveProvider(chainConfig('brave-key'))
    await expect(provider.search({ query: 'proof' })).rejects.toThrow('brave returned 429: quota exceeded')
  })

  it('flags non-JSON bodies as engine failures', async () => {
    stubFetch(200, '<html>challenge</html>')
    const provider = new BraveProvider(chainConfig('brave-key'))
    await expect(provider.search({ query: 'proof' })).rejects.toThrow(/invalid JSON/)
  })

  it('refuses overlong queries before hitting the API', async () => {
    const calls = stubFetch()
    const provider = new BraveProvider(chainConfig('brave-key'))
    await expect(provider.search({ query: 'x'.repeat(501) })).rejects.toThrow(/exceed 500 characters/)
    expect(calls).toHaveLength(0)
  })

  it('is available only with a configured key and refuses to search without one', async () => {
    expect(new BraveProvider(chainConfig('brave-key')).available()).toBe(true)
    expect(new BraveProvider(chainConfig(undefined)).available()).toBe(false)
    stubFetch(500)
    const provider = new BraveProvider(chainConfig(undefined))
    await expect(provider.search({ query: 'proof' })).rejects.toThrow(/no API key/)
  })
})

describe('brave engine credential hygiene', () => {
  it('never surfaces the API key when an error body echoes it', async () => {
    stubFetch(401, '{"message":"denied for brave-key"}')
    const provider = new BraveProvider(chainConfig('brave-key'))
    const failure = await provider.search({ query: 'proof' }).catch((error: unknown) => error)
    if (!(failure instanceof Error)) throw new Error('expected the search to fail')
    expect(failure.message).toContain('[redacted]')
    expect(failure.message).not.toContain('brave-key')
  })
})
