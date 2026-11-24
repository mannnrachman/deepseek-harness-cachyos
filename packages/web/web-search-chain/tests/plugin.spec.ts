import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime, { WebError } from '@deepseek-ai/dsh-web'
import * as chainPlugin from '../src/index.ts'

/** Mount the web seam and the chain plugin on a fresh root context. */
async function mount(config: Record<string, unknown> = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(WebRuntime, {})
  await ctx.plugin(chainPlugin, config)
  return ctx
}

describe('web-search-chain plugin', () => {
  it('registers the chain into the web seam as a module-namespace plugin', async () => {
    const ctx = await mount()
    expect(ctx.web.listProviders().search.map(entry => entry.id)).toEqual(['omp-chain'])
  })

  it('leaves the seam without a usable search provider when disabled', async () => {
    const ctx = await mount({ enabled: false })
    // Registration is still listed for pickers; only usability changes.
    expect(ctx.web.listProviders().search.map(entry => entry.id)).toEqual(['omp-chain'])
    const failure = await ctx.web.search({ query: 'proof' }).catch((error: unknown) => error)
    if (!(failure instanceof WebError)) throw new Error('expected the search to be refused')
    expect(failure.code).toBe('WEB_PROVIDER_UNAVAILABLE')
  })

  it('rejects a non-positive engine timeout at plugin construction', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, {})
    await expect(ctx.plugin(chainPlugin, { timeoutMs: 0 })).rejects.toThrow(/timeoutMs must be a positive finite number/)
  })

  it('unregisters the chain when the plugin is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, {})
    const fiber = await ctx.plugin(chainPlugin, {})
    expect(ctx.web.listProviders().search).toHaveLength(1)
    await fiber.dispose()
    expect(ctx.web.listProviders().search).toHaveLength(0)
  })
})
