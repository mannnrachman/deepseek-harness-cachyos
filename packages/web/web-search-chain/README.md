---
description: "The automatic fallback chain of web search providers for ctx.web: how a composition gets web search without a DeepSeek account or API key."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-chain

English | [中文](README.zh.md)

## Summary

With `dsh-web-search-chain`, the harness can search the web through the web service (`ctx.web`) without a DeepSeek account or API key. The provider tries its engines in order — Parallel, DuckDuckGo, SearXNG, Brave, Tavily — and returns the first result that carries sources, so a search no longer fails because one engine is blocked, throttled, or left unconfigured. The model-facing `web_search` tool lives in `dsh-tool-web`, which renders the sources this chain returns.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the provider in a composition that already loads the web service; it registers as the `omp-chain` search provider. The `dsh-base` bundle of this repository configures it as the `searchProvider`, so a profile searches through the chain whatever state any DeepSeek credential is in. The Web search settings menu or a profile patch selects another provider in its place.

### When to choose it

Choose this chain when a deployment must search the web independently of DeepSeek credentials, or when a search should survive one engine being unavailable.

### Minimal configuration

Every field has a default and an empty config is valid. Credentials come from the environment unless the matching field is set: `SEARXNG_ENDPOINT`, `BRAVE_API_KEY`, and `TAVILY_API_KEY` enable the SearXNG, Brave, and Tavily engines, and an engine without its credential stays out of the chain. Parallel and DuckDuckGo need none.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-chain'
  config:
    enabled: true
    # order: parallel,duckduckgo,searxng,brave,tavily
    # timeoutMs: 45000
```

`enabled: false` keeps the chain registered but unusable. `order` lists engine ids in fallback order and keeps the default order when empty. `timeoutMs` is the per-engine transport ceiling and must be a positive finite number; any other value fails plugin construction.

<a id="understand-the-implementation"></a>
## Understand the implementation

This section explains the design decisions behind the provider; the observable behavior is fully stated in [Use this package](#use-this-package).

The plugin is a module-namespace Cordis plugin: `apply` registers one `WebSearchProvider` with `ctx.web`, and the registration lives as long as the plugin fiber. The provider owns an ordered list of engines, each a `WebSearchProvider` whose `available()` reads configuration only. A search runs the engines in order, each under its own `AbortSignal` timeout: an unavailable engine is skipped, an engine that throws, times out, or returns neither sources nor content is recorded, and the first usable result wins. When every engine fails the provider throws `WebError` `WEB_PROVIDER_UNAVAILABLE` with one entry per failed engine.

<a id="further-exploration"></a>
## Further Exploration

- [dsh-web](../web/README.md) defines the provider interfaces and the selection rules that a configured chain takes the place of.
- [dsh-web-fetch-http](../web-fetch-http/README.md) is the credential-free fetch provider the same bundle configures for page retrieval.
- [dsh-tool-web](../tool-web/README.md) owns the model-facing `web_search` tool and renders the returned sources.
- [oh-my-pi](https://github.com/can1357/oh-my-pi) `packages/coding-agent/src/web/search` is the MIT-licensed provider chain whose design and engine adapters this package ports.

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-web`, which renders this provider's sources under its search-result wrapper while the engine order and each engine's transport stay hidden; the model cannot tell which engine answered. When every engine fails, the tool error names each engine and why it failed, so the model can decide whether to retry, rephrase the query, or proceed without search.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the provider is a poor fit. They are current package constraints.

- **Engine adapters are narrower than their oh-my-pi originals** — there is no query-directive parsing, recency filtering, or result-count negotiation beyond `maxResults`, so operators such as `site:` or `after:` reach each engine as plain query text.
- **Parallel uses its keyless endpoint only** — requests carry no credential and are rate limited per IP; there is no authenticated Parallel path.
- **SearXNG sends anonymous requests only** — the adapter has no basic-auth or bearer-token configuration.
- **DuckDuckGo scrapes an HTML frontend** — it is unusable on networks that block its hostname or serve it a bot-detection challenge, and the chain then relies on its other engines.
- **A chain that is not the configured provider can make selection ambiguous** — with no `searchProvider` configured, a usable DeepSeek provider that is not the one assigned to the model route leaves two usable providers, and the seam reports `WEB_PROVIDER_AMBIGUOUS` until one is configured.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
