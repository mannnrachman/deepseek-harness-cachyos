import { describe, expect, it } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import { OmpChainSearchProvider } from '../src/omp-chain.ts'
import { DEFAULT_ORDER } from '../src/config.ts'

const request: WebSearchRequest = { query: 'fallback chain proof' }

const config = {
  enabled: true,
  order: DEFAULT_ORDER,
  searxngEndpoint: undefined,
  braveApiKey: undefined,
  tavilyApiKey: undefined,
  timeoutMs: 45_000,
}

function engine(id: string, behavior: 'ok' | 'fail' | 'empty' | 'unavailable'): WebSearchProvider {
  return {
    id,
    available: () => behavior !== 'unavailable',
    search: async () => {
      if (behavior === 'fail') throw new Error(`${id} exploded`)
      if (behavior === 'empty') return { sources: [], truncated: false }
      return { sources: [{ url: `https://example.com/${id}`, title: id }], truncated: false }
    },
  }
}

describe('omp fallback chain', () => {
  it('falls through a failing engine and returns the first usable result', async () => {
    const provider = new OmpChainSearchProvider(
      { ...config, order: ['duckduckgo', 'parallel'] },
      id => engine(id, id === 'duckduckgo' ? 'fail' : 'ok'),
    )
    const result = await provider.search(request)
    expect(result.sources[0]?.url).toBe('https://example.com/parallel')
  })

  it('skips engines that report unavailable', async () => {
    const provider = new OmpChainSearchProvider(
      { ...config, order: ['duckduckgo', 'searxng', 'brave', 'tavily'] },
      id => engine(id, id === 'searxng' ? 'unavailable' : 'ok'),
    )
    const result = await provider.search({ ...request, maxResults: 3 })
    expect(result.truncated).toBe(false)
    expect(result.sources.length).toBeGreaterThan(0)
  })

  it('keeps looking when an engine returns no sources', async () => {
    const provider = new OmpChainSearchProvider(
      { ...config, order: ['duckduckgo', 'parallel'] },
      id => engine(id, id === 'duckduckgo' ? 'empty' : 'ok'),
    )
    const result = await provider.search(request)
    expect(result.sources[0]?.url).toBe('https://example.com/parallel')
  })

  it('records a timeout and falls through when an engine hangs', async () => {
    const hanging: WebSearchProvider = {
      id: 'duckduckgo',
      available: () => true,
      search: (_request, signal) => {
        const { promise, reject } = Promise.withResolvers<WebSearchResult>()
        signal?.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
        return promise
      },
    }
    const provider = new OmpChainSearchProvider(
      { ...config, order: ['duckduckgo', 'parallel'], timeoutMs: 20 },
      id => (id === 'duckduckgo' ? hanging : engine(id, 'ok')),
    )
    const result = await provider.search(request)
    expect(result.sources[0]?.url).toBe('https://example.com/parallel')

    const onlyHanging = new OmpChainSearchProvider({ ...config, order: ['duckduckgo'], timeoutMs: 20 }, () => hanging)
    await expect(onlyHanging.search(request)).rejects.toThrow(/duckduckgo: timed out after 20ms/)
  })

  it('surfaces every failure when all engines fail', async () => {
    const provider = new OmpChainSearchProvider(
      { ...config, order: ['duckduckgo', 'parallel'] },
      id => engine(id, 'fail'),
    )
    await expect(provider.search(request)).rejects.toThrow(WebError)
    await expect(provider.search(request)).rejects.toThrow(/duckduckgo: duckduckgo exploded/)
    await expect(provider.search(request)).rejects.toThrow(/parallel: parallel exploded/)
  })

  it('is unavailable when disabled or no engine can run', () => {
    const disabled = new OmpChainSearchProvider({ ...config, enabled: false }, () => undefined)
    expect(disabled.available()).toBe(false)
    const noEngine = new OmpChainSearchProvider({ ...config, order: ['searxng'] }, () => undefined)
    expect(noEngine.available()).toBe(false)
    expect(new OmpChainSearchProvider(config, () => undefined).available()).toBe(true)
  })
})
