import { afterEach, describe, expect, it, vi } from 'vitest'
import { DuckDuckGoProvider } from '../src/providers/duckduckgo.ts'

const SAMPLE_HTML = `
<div class="results">
  <div class="result results_links results_links_default web-result">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Falpha&amp;rut=abc">Alpha &amp; beta result</a></h2>
    <a class="result__snippet" href="//example.com/x">First &amp; only <b>snippet</b> here</a>
  </div>
  <div class="result">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="https://direct.example.com/beta">Direct beta</a></h2>
    <a class="result__snippet">second snippet</a>
  </div>
</div>
`

const ANOMALY_HTML = '<body class="anomaly-modal">challenge</body>'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('duckduckgo engine', () => {
  it('parses links, unwraps redirects and pairs snippets', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SAMPLE_HTML, { status: 200 })))
    const provider = new DuckDuckGoProvider()
    const result = await provider.search({ query: 'proof', maxResults: 5 })
    expect(result.truncated).toBe(false)
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]?.url).toBe('https://example.com/alpha')
    expect(result.sources[0]?.title).toBe('Alpha & beta result')
    expect(result.sources[0]?.snippet).toContain('First & only snippet here')
    expect(result.sources[1]?.url).toBe('https://direct.example.com/beta')
  })

  it('flags the bot-detection challenge as an engine failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ANOMALY_HTML, { status: 200 })))
    const provider = new DuckDuckGoProvider()
    await expect(provider.search({ query: 'proof' })).rejects.toThrow(/bot-detection/)
  })

  it('raises plain HTTP failures for the chain to record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 503 })))
    const provider = new DuckDuckGoProvider()
    await expect(provider.search({ query: 'proof' })).rejects.toThrow(/503/)
  })
})
