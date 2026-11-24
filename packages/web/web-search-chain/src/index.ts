/**
 * Automatic fallback chain of web search providers for `ctx.web`, following the
 * provider-chain design of oh-my-pi: try the ordered engines in sequence, return
 * the first result that carries usable content, and surface an honest failure
 * list when everything fails.
 *
 * The chain is the only search provider that needs no DeepSeek account or API
 * key, so the seam selects it on its own wherever no DeepSeek provider is
 * usable. Where one is, the seam keeps preferring the DeepSeek provider of the
 * model route unless this chain is configured as the `searchProvider`.
 * @module @deepseek-ai/dsh-web-search-chain
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'
import { DEFAULT_TIMEOUT_MS, parseChainOrder, resolveChainConfig, type ChainEngineId, type ResolvedChainConfig } from './config.ts'
import { OmpChainSearchProvider } from './omp-chain.ts'
import { BraveProvider } from './providers/brave.ts'
import { DuckDuckGoProvider } from './providers/duckduckgo.ts'
import { ParallelProvider } from './providers/parallel.ts'
import { SearXNGProvider } from './providers/searxng.ts'
import { TavilyProvider } from './providers/tavily.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-chain'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config: overrides of the environment-derived chain settings. */
export interface Config {
  /** Whether the chain takes part in provider selection. */
  enabled?: boolean
  /** Engines to try, in fallback order (comma-separated engine ids); empty keeps the default order. */
  order?: string
  /** SearXNG instance endpoint; empty leaves `SEARXNG_ENDPOINT` in charge. */
  searxngEndpoint?: string
  /** Brave Search API key; empty leaves `BRAVE_API_KEY` in charge. */
  braveApiKey?: string
  /** Tavily API key; empty leaves `TAVILY_API_KEY` in charge. */
  tavilyApiKey?: string
  /** Per-engine transport ceiling in milliseconds. */
  timeoutMs?: number
}

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** Plugin config schema; every field has a default, so an empty config is valid. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(process.env.DSH_SEARCH_CHAIN_ENABLED !== '0'),
  order: z.string().default(''),
  searxngEndpoint: z.string().default(''),
  braveApiKey: z.string().default(''),
  tavilyApiKey: z.string().default(''),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS),
})

/** A resource limit (timeout cap) must be a positive finite number. */
function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`web-search-chain: ${name} must be a positive finite number`)
  }
}

/** Merge the plugin config over the environment-derived settings; empty strings keep the environment value. */
function resolve(environment: ResolvedChainConfig, config: ResolvedConfig): ResolvedChainConfig {
  const order = config.order.trim()
  return {
    enabled: config.enabled,
    order: order === '' ? environment.order : parseChainOrder(order),
    searxngEndpoint: config.searxngEndpoint.trim() || environment.searxngEndpoint,
    braveApiKey: config.braveApiKey.trim() || environment.braveApiKey,
    tavilyApiKey: config.tavilyApiKey.trim() || environment.tavilyApiKey,
    timeoutMs: config.timeoutMs,
  }
}

/**
 * Register the automatic fallback search chain with `ctx.web`.
 * @param ctx - Context that already provides the web service.
 * @param config - Plugin config; schemastery has filled every field default.
 * @throws When `timeoutMs` is not a positive finite number or `order` names an unknown engine.
 */
export function apply(ctx: Context, config: Config): void {
  const resolvedConfig = config as ResolvedConfig
  assertPositiveFinite('timeoutMs', resolvedConfig.timeoutMs)
  const resolved = resolve(resolveChainConfig(process.env), resolvedConfig)
  const engines = new Map<ChainEngineId, WebSearchProvider>([
    ['duckduckgo', new DuckDuckGoProvider()],
    ['parallel', new ParallelProvider()],
    ['searxng', new SearXNGProvider(resolved)],
    ['brave', new BraveProvider(resolved)],
    ['tavily', new TavilyProvider(resolved)],
  ])
  ctx.web.registerSearchProvider(new OmpChainSearchProvider(resolved, id => engines.get(id)))
}
