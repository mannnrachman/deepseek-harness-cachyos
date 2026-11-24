/**
 * The fallback chain provider: runs the configured engines in order and returns
 * the first result that carries usable content. Every failed attempt is
 * recorded so the final error is an honest list instead of a single cause.
 * @module
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import { resolveCandidates, type ChainEngineId, type ResolvedChainConfig } from './config.ts'

/** Registry id this provider registers under. */
export const CHAIN_PROVIDER_ID = 'omp-chain'

/** One engine attempt that could not produce a usable result. */
export interface ChainAttemptFailure {
  readonly engine: ChainEngineId
  readonly reason: string
}

/** Builds the engine map handed to the chain; engines missing from the map are skipped. */
export type ChainEngineResolver = (id: ChainEngineId) => WebSearchProvider | undefined

/**
 * Sequential fallback over the configured engines — the oh-my-pi provider-chain
 * design: the first result with usable content wins, unavailable engines are
 * skipped without counting as failures, and cancellation rethrows instead of
 * falling through to the next engine.
 */
export class OmpChainSearchProvider implements WebSearchProvider {
  readonly id = CHAIN_PROVIDER_ID
  readonly title = 'Search chain (automatic fallback)'

  readonly description = {
    en: 'Automatic fallback chain: tries the configured search engines in order (Parallel, DuckDuckGo, SearXNG, Brave, Tavily) and returns the first usable answer. Free engines need no account or API key.',
  }

  constructor(
    private readonly config: ResolvedChainConfig,
    private readonly engines: ChainEngineResolver,
  ) {}

  /** Usable while enabled and at least one engine can run (local checks only). */
  available(): boolean {
    return this.config.enabled && resolveCandidates(this.config).length > 0
  }

  /** The chain carries no route-bound credentials of its own. */
  ready(): Promise<boolean> {
    return Promise.resolve(true)
  }

  /** Run the engines in fallback order; the first usable result wins. */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const failures: ChainAttemptFailure[] = []
    for (const id of resolveCandidates(this.config)) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('The search was aborted.', 'AbortError')
      const engine = this.engines(id)
      if (engine === undefined || !engine.available()) continue
      // Each engine gets its own transport ceiling, so a hanging engine is recorded as a
      // failure and the chain moves on instead of stalling behind it.
      const timeout = AbortSignal.timeout(this.config.timeoutMs)
      try {
        const result = await engine.search(
          request,
          signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
        )
        if (result.sources.length === 0 && result.content === undefined) {
          failures.push({ engine: id, reason: 'no sources returned' })
          continue
        }
        return result
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error
        failures.push({
          engine: id,
          reason: timeout.aborted
            ? `timed out after ${String(this.config.timeoutMs)}ms`
            : error instanceof Error ? error.message : String(error),
        })
      }
    }
    const detail = failures.map(failure => `${failure.engine}: ${failure.reason}`).join('; ')
    throw new WebError(`all search engines failed (${detail || 'no engine is usable'})`, 'WEB_PROVIDER_UNAVAILABLE')
  }
}
