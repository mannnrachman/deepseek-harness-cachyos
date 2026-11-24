import { afterEach, describe, expect, it, vi } from 'vitest'
import { ParallelProvider } from '../src/providers/parallel.ts'

const PAYLOAD = {
  results: [
    { url: 'https://example.com/alpha', title: 'Alpha', excerpts: ['one excerpt', 'two excerpt'], publish_date: '2026-01-02' },
    { url: 'https://example.com/beta', excerpts: [] },
  ],
}

/** Parse the JSON body a captured request sent; throws when it did not send a JSON string. */
function requestBodyOf(init: RequestInit | undefined): unknown {
  const body = init?.body
  if (typeof body !== 'string') throw new Error('expected a JSON string request body')
  return JSON.parse(body)
}

/** The JSON-RPC request id a captured request sent. */
function requestIdOf(init: RequestInit | undefined): string {
  const request = requestBodyOf(init)
  if (typeof request !== 'object' || request === null || !('id' in request)) {
    throw new Error('expected a request id')
  }
  const { id } = request
  if (typeof id !== 'string') throw new Error('expected a string request id')
  return id
}

function rpcResult(result: unknown, id: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

interface CapturedCall {
  readonly init: RequestInit | undefined
}

function stubFetch(
  respond: (requestId: string) => string = requestId => rpcResult({ structuredContent: PAYLOAD }, requestId),
  status = 200,
  contentType = 'application/json',
): readonly CapturedCall[] {
  const calls: CapturedCall[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: URL | string, init?: RequestInit) => {
    calls.push({ init })
    const requestId = requestIdOf(init)
    return new Response(respond(requestId), { status, headers: { 'content-type': contentType } })
  }))
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parallel keyless engine', () => {
  it('posts a bare tools/call web_search and parses the structured payload', async () => {
    const calls = stubFetch()
    const provider = new ParallelProvider()
    const result = await provider.search({ query: 'proof' })

    expect(result.truncated).toBe(false)
    expect(result.content).toBeUndefined()
    expect(calls).toHaveLength(1)
    const { init } = calls[0]!
    expect(requestBodyOf(init)).toMatchObject({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'web_search', arguments: { objective: 'proof', search_queries: ['proof'] } },
    })
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json' })

    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]).toEqual({
      url: 'https://example.com/alpha',
      title: 'Alpha',
      snippet: 'one excerpt\n\ntwo excerpt',
      publishedAt: '2026-01-02',
    })
    expect(result.sources[1]).toEqual({ url: 'https://example.com/beta', title: 'https://example.com/beta' })

    const sliced = await provider.search({ query: 'proof', maxResults: 1 })
    expect(sliced.sources).toHaveLength(1)
  })

  it('falls back to the first JSON text block without structured content', async () => {
    stubFetch(requestId => rpcResult({ content: [
      { type: 'image', data: 'ignored' },
      { type: 'text', text: JSON.stringify(PAYLOAD) },
    ] }, requestId))
    const provider = new ParallelProvider()
    const result = await provider.search({ query: 'proof' })
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]?.snippet).toBe('one excerpt\n\ntwo excerpt')
  })

  it('surfaces tool-reported errors as engine failures', async () => {
    stubFetch(requestId => rpcResult({ isError: true, content: [{ type: 'text', text: '  quota exhausted  ' }] }, requestId))
    const provider = new ParallelProvider()
    await expect(provider.search({ query: 'proof' })).rejects.toThrow('quota exhausted')
  })

  it('raises JSON-RPC error replies for the chain to record', async () => {
    stubFetch(requestId => JSON.stringify({ jsonrpc: '2.0', id: requestId, error: { code: -32000, message: 'boom' } }))
    const provider = new ParallelProvider()
    await expect(provider.search({ query: 'proof' })).rejects.toThrow('parallel MCP error: boom')
  })

  it('flags rate limiting of the keyless endpoint', async () => {
    stubFetch(() => 'slow down', 429)
    const provider = new ParallelProvider()
    await expect(provider.search({ query: 'proof' })).rejects.toThrow(/rate limit/)
  })

  it('reads the matching JSON-RPC reply out of an SSE body', async () => {
    const calls: CapturedCall[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: URL | string, init?: RequestInit) => {
      calls.push({ init })
      const id = requestIdOf(init)
      const sse = [
        'event: other',
        `data: ${JSON.stringify({ jsonrpc: '2.0', id: 'someone-else', result: { structuredContent: { results: [] } } })}`,
        '',
        'event: message',
        `data: ${JSON.stringify({ jsonrpc: '2.0', id, result: { structuredContent: PAYLOAD } })}`,
        '',
      ].join('\n')
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }))
    const provider = new ParallelProvider()
    const result = await provider.search({ query: 'proof' })
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]?.url).toBe('https://example.com/alpha')
  })

  it('returns empty sources without throwing when Parallel finds nothing', async () => {
    stubFetch(requestId => rpcResult({ structuredContent: { results: [] } }, requestId))
    const provider = new ParallelProvider()
    const result = await provider.search({ query: 'proof' })
    expect(result.sources).toEqual([])
    expect(result.truncated).toBe(false)
  })

  it('is keyless and always available', () => {
    expect(new ParallelProvider().available()).toBe(true)
  })
})
