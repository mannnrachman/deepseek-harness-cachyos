/**
 * Keyless Parallel search engine: drives the public MCP endpoint with a bare
 * JSON-RPC `tools/call` for `web_search` (no handshake, no credential) and
 * parses sources out of the tool result — the structured payload when present,
 * otherwise the first JSON text block. The anonymous path is rate limited, so
 * transport failures surface as plain errors for the chain to fall through.
 * @module
 */

import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

/** Registry id of the keyless Parallel engine. */
export const PARALLEL_PROVIDER_ID = 'parallel'

const ENDPOINT = 'https://search.parallel.ai/mcp'

/** Engines default to 10 results; the cap lives in the Parallel payload. */
const DEFAULT_COUNT = 10

/** One decoded JSON-RPC reply: either a result or an error message. */
interface RpcMessage {
  readonly result: unknown
  readonly errorMessage: string | undefined
}

/** The MCP tool-result fields the keyless search path reads. */
interface ToolResult {
  readonly structuredContent: unknown
  readonly content: readonly unknown[]
  readonly isError: boolean
}

/** Narrow a JSON-RPC reply to the matching request id, batching included. */
function rpcMessageOf(payload: unknown, id: string): RpcMessage | undefined {
  for (const message of Array.isArray(payload) ? payload : [payload]) {
    if (typeof message !== 'object' || message === null) continue
    const record = message as Record<string, unknown>
    if (record.id !== id) continue
    const error = typeof record.error === 'object' && record.error !== null
      ? (record.error as Record<string, unknown>)
      : undefined
    return {
      result: record.result,
      errorMessage: typeof error?.message === 'string' ? error.message : undefined,
    }
  }
  return undefined
}

/** Scan `data:` events for the matching JSON-RPC reply (SSE transport). */
function rpcMessageFromSse(text: string, id: string): RpcMessage | undefined {
  let data = ''
  for (const line of `${text}\n`.split('\n')) {
    if (line.startsWith('data:')) {
      data += `${data === '' ? '' : '\n'}${line.slice(5).trimStart()}`
      continue
    }
    if (line.trim() === '' && data !== '') {
      let message: RpcMessage | undefined
      try {
        message = rpcMessageOf(JSON.parse(data), id)
      } catch {
        message = undefined
      }
      data = ''
      if (message !== undefined) return message
    }
  }
  return undefined
}

/** Narrow a JSON-RPC result to the MCP tool-result fields the search path reads. */
function toolResultOf(result: unknown): ToolResult | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const record = result as Record<string, unknown>
  return {
    structuredContent: record.structuredContent,
    content: Array.isArray(record.content) ? record.content : [],
    isError: record.isError === true,
  }
}

/** First `text` block of a tool result, for tool-reported failure messages. */
function textContentOf(result: ToolResult): string | undefined {
  for (const item of result.content) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string' && record.text.trim() !== '') {
      return record.text.trim()
    }
  }
  return undefined
}

/** Map a Parallel search payload (`results[]` with excerpts) into chain sources. */
function parsePayload(payload: unknown): readonly WebSearchSource[] {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('parallel MCP returned an invalid search payload')
  }
  if (!('results' in payload)) return []
  const results: unknown = payload.results
  if (!Array.isArray(results)) return []
  const sources: WebSearchSource[] = []
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) continue
    const item = entry as Record<string, unknown>
    const url = typeof item.url === 'string' && item.url !== '' ? item.url : undefined
    if (url === undefined) continue
    const excerpts = Array.isArray(item.excerpts)
      ? item.excerpts.filter((excerpt): excerpt is string => typeof excerpt === 'string')
      : []
    const snippet = excerpts.length > 0 ? excerpts.join('\n\n') : undefined
    const publishedAt = typeof item.publish_date === 'string' && item.publish_date !== '' ? item.publish_date : undefined
    sources.push({
      url,
      title: typeof item.title === 'string' && item.title !== '' ? item.title : url,
      ...(snippet === undefined ? {} : { snippet }),
      ...(publishedAt === undefined ? {} : { publishedAt }),
    })
  }
  return sources
}

/** Read the search payload out of a tool result: structured content first, then JSON text blocks. */
function sourcesOf(result: ToolResult): readonly WebSearchSource[] {
  if (result.structuredContent !== undefined) return parsePayload(result.structuredContent)
  for (const item of result.content) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    if (record.type !== 'text' || typeof record.text !== 'string') continue
    try {
      return parsePayload(JSON.parse(record.text))
    } catch {
      continue
    }
  }
  return []
}

/** Keyless Parallel engine for the fallback chain. */
export class ParallelProvider implements WebSearchProvider {
  readonly id = PARALLEL_PROVIDER_ID
  readonly title = 'Parallel'

  readonly description = {
    en: 'Parallel Web Systems search, keyless path. This is the same fallback engine the omp harness uses.',
  }

  /** Anonymous public MCP search: always usable (local check only). */
  available(): boolean {
    return true
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const count = request.maxResults ?? DEFAULT_COUNT
    const id = Math.random().toString(36).slice(2)
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: 'web_search',
          arguments: { objective: request.query, search_queries: [request.query] },
        },
      }),
      ...(signal === undefined ? {} : { signal }),
    })
    const body = await response.text()
    if (!response.ok) {
      const detail = body.trim().slice(0, 200)
      const suffix = response.status === 429 ? ' (keyless rate limit; the chain moves on to the next engine)' : ''
      throw new Error(`parallel MCP request failed (${String(response.status)})${suffix}${detail === '' ? '' : `: ${detail}`}`)
    }
    const sse = response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') ?? false
    let message: RpcMessage | undefined
    try {
      message = sse ? rpcMessageFromSse(body, id) : rpcMessageOf(JSON.parse(body), id)
    } catch {
      message = undefined
    }
    if (message === undefined) throw new Error('parallel MCP returned an unreadable response')
    if (message.errorMessage !== undefined) throw new Error(`parallel MCP error: ${message.errorMessage}`)
    const result = toolResultOf(message.result)
    if (result === undefined) throw new Error('parallel MCP returned an unexpected response shape')
    if (result.isError) throw new Error(textContentOf(result) ?? 'parallel MCP returned an error')
    return { sources: sourcesOf(result).slice(0, count), truncated: false }
  }
}
