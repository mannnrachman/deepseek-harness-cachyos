/** Shared vocabulary for the fallback search chain. @module */

import type { WebSearchProvider } from '@deepseek-ai/dsh-web'

/** Stable provider ids the chain can try. */
export type ChainEngineId = 'parallel' | 'duckduckgo' | 'searxng' | 'brave' | 'tavily'

/** One engine backend the chain can fall back through. */
export interface ChainEngine extends WebSearchProvider {
  readonly id: ChainEngineId
}

/**
 * Resolved chain configuration. Credentials come from the process environment
 * (BRAVE_API_KEY, TAVILY_API_KEY, SEARXNG_ENDPOINT) plus optional plugin config
 * overrides; engines without their credential stay out of the candidate list.
 */
export interface ResolvedChainConfig {
  /** Whether the chain provider participates in selection at all. */
  readonly enabled: boolean
  /** Engines to try, in fallback order. */
  readonly order: readonly ChainEngineId[]
  /** SearXNG instance endpoint (`SEARXNG_ENDPOINT`); the engine is skipped without one. */
  readonly searxngEndpoint: string | undefined
  /** Brave Search API key (`BRAVE_API_KEY`). */
  readonly braveApiKey: string | undefined
  /** Tavily API key (`TAVILY_API_KEY`). */
  readonly tavilyApiKey: string | undefined
  /** Hard per-engine transport ceiling in milliseconds. */
  readonly timeoutMs: number
}

/** Default per-engine transport ceiling in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 45_000

/** Engines tried, in fallback order, when no order is configured. */
export const DEFAULT_ORDER: readonly ChainEngineId[] = ['parallel', 'duckduckgo', 'searxng', 'brave', 'tavily']

/** Whether a string names one of the chain's engines. */
function isChainEngineId(value: string): value is ChainEngineId {
  return (DEFAULT_ORDER as readonly string[]).includes(value)
}

/**
 * Parse a comma-separated engine order.
 * @param raw - Comma-separated engine ids; whitespace around an id is ignored.
 * @returns The named engines, in the given order.
 * @throws When an id names no engine or the list names none.
 */
export function parseChainOrder(raw: string): readonly ChainEngineId[] {
  const ids: ChainEngineId[] = []
  for (const entry of raw.split(',')) {
    const id = entry.trim()
    if (id === '') continue
    if (!isChainEngineId(id)) {
      throw new Error(`web-search-chain: unknown search engine ${JSON.stringify(id)}; expected one of ${DEFAULT_ORDER.join(', ')}`)
    }
    ids.push(id)
  }
  if (ids.length === 0) throw new Error('web-search-chain: order must name at least one search engine')
  return ids
}

/**
 * Read the chain configuration from the process environment.
 * @param env - Environment to read; defaults to the process environment.
 * @returns The environment-derived chain settings.
 * @throws When `DSH_SEARCH_CHAIN_ORDER` is set and names no known engine.
 */
export function resolveChainConfig(env: NodeJS.ProcessEnv = process.env): ResolvedChainConfig {
  const orderRaw = env.DSH_SEARCH_CHAIN_ORDER?.trim()
  return {
    // Enabled unless explicitly turned off. The seam keeps preferring the DeepSeek provider
    // of the model route when that one is usable, so this chain only answers searches it is
    // configured for or that no DeepSeek provider can serve.
    enabled: env.DSH_SEARCH_CHAIN_ENABLED !== '0',
    order: orderRaw === undefined || orderRaw === '' ? DEFAULT_ORDER : parseChainOrder(orderRaw),
    searxngEndpoint: env.SEARXNG_ENDPOINT?.trim() || undefined,
    braveApiKey: env.BRAVE_API_KEY?.trim() || undefined,
    tavilyApiKey: env.TAVILY_API_KEY?.trim() || undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }
}

/**
 * Build the ordered candidate list: only engines that can actually run.
 * @param config - Resolved chain settings.
 * @returns The configured engines that hold their credential, in fallback order.
 */
export function resolveCandidates(config: ResolvedChainConfig): readonly ChainEngineId[] {
  return config.order.filter((id) => {
    if (id === 'searxng') return config.searxngEndpoint !== undefined
    if (id === 'brave') return config.braveApiKey !== undefined
    if (id === 'tavily') return config.tavilyApiKey !== undefined
    return true
  })
}

/**
 * Remove configured secrets from text that will be surfaced to the model, such
 * as engine failure reasons: a provider's error body can echo the credential
 * that was sent to it, and the chain reports every failure reason verbatim.
 * @param text - Text that may contain a secret.
 * @param secrets - Secrets to remove; empty and missing values are ignored.
 * @returns The text with every occurrence of a secret replaced by `[redacted]`.
 */
export function redactSecrets(text: string, secrets: readonly (string | undefined)[]): string {
  let redacted = text
  for (const secret of secrets) {
    if (secret !== undefined && secret !== '') redacted = redacted.replaceAll(secret, '[redacted]')
  }
  return redacted
}
