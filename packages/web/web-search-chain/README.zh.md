---
description: "ctx.web 的自动回退网页搜索提供方链：组合如何在没有 DeepSeek 账号或 API 密钥的情况下获得网页搜索。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-chain

[English](README.md) | 中文

## 概述

有了 `dsh-web-search-chain`，harness 可以通过 web 服务（`ctx.web`）搜索网页，无需 DeepSeek 账号或 API 密钥。该提供方按顺序尝试它的引擎——Parallel、DuckDuckGo、SearXNG、Brave、Tavily——并返回第一个带有来源的结果，因此搜索不会再因为某一个引擎被封锁、被限流或未配置而失败。面向模型的 `web_search` 工具位于 `dsh-tool-web`，由它渲染本链返回的来源。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已经加载 web 服务的组合中挂载该提供方；它注册为 `omp-chain` 搜索提供方。本仓库的 `dsh-base` bundle 将其配置为 `searchProvider`，因此无论 DeepSeek 凭据处于何种状态，profile 都通过本链搜索。网页搜索设置菜单或 profile 补丁可以选择其他提供方来取代它。

### 何时选择

当部署必须独立于 DeepSeek 凭据进行网页搜索，或者搜索应当在某一个引擎不可用时仍然成功，选择本链。

### 最小配置

每个字段都有默认值，空配置有效。凭据来自环境变量，除非设置了对应字段：`SEARXNG_ENDPOINT`、`BRAVE_API_KEY` 和 `TAVILY_API_KEY` 启用 SearXNG、Brave 和 Tavily 引擎，缺少凭据的引擎不进入本链。Parallel 和 DuckDuckGo 不需要任何凭据。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-chain'
  config:
    enabled: true
    # order: parallel,duckduckgo,searxng,brave,tavily
    # timeoutMs: 45000
```

`enabled: false` 使本链保持注册但不可用。`order` 按回退顺序列出引擎 id，为空时保持默认顺序。`timeoutMs` 是每个引擎的传输上限，必须是正的有限数；其他任何值都会使插件构造失败。

<a id="understand-the-implementation"></a>
## 理解实现

本节解释提供方背后的设计决策；可观察行为已在[使用本包](#use-this-package)中完整说明。

该插件是一个模块命名空间 Cordis 插件：`apply` 向 `ctx.web` 注册一个 `WebSearchProvider`，注册与插件 fiber 同寿命。该提供方持有一份有序的引擎列表，每个引擎都是一个 `WebSearchProvider`，其 `available()` 只读取配置。一次搜索按顺序运行各引擎，每个引擎有自己的 `AbortSignal` 超时：不可用的引擎被跳过，抛出错误、超时或既不返回来源也不返回内容的引擎被记录，第一个可用的结果胜出。当所有引擎都失败时，该提供方抛出 `WebError` `WEB_PROVIDER_UNAVAILABLE`，其中为每个失败的引擎列出一条记录。

<a id="further-exploration"></a>
## 进一步探索

- [dsh-web](../web/README.zh.md) 定义了提供方接口，以及已配置的本链所取代的选择规则。
- [dsh-web-fetch-http](../web-fetch-http/README.zh.md) 是同一 bundle 为页面抓取配置的免凭据抓取提供方。
- [dsh-tool-web](../tool-web/README.zh.md) 拥有面向模型的 `web_search` 工具，并渲染返回的来源。
- [oh-my-pi](https://github.com/can1357/oh-my-pi) 的 `packages/coding-agent/src/web/search` 是本包移植其设计与引擎适配器的 MIT 许可提供方链。

<a id="model-experience"></a>
## 模型体验

间接地，通过 `dsh-tool-web`：它在搜索结果包装下渲染该提供方的来源，而引擎顺序和各引擎的传输保持隐藏；模型无法分辨是哪个引擎作出的回答。当所有引擎都失败时，工具错误会列出每个引擎及其失败原因，使模型能够决定重试、改写查询，还是不进行搜索而继续。

#### KV Cache 影响

没有直接的失效；具名消费者负责任何请求前缀变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了该提供方何时不适用。它们是当前的包约束。

- **引擎适配器比其 oh-my-pi 原版更窄** —— 没有查询指令解析、时效性过滤，也没有超出 `maxResults` 的结果数量协商，因此 `site:` 或 `after:` 等操作符会作为普通查询文本到达每个引擎。
- **Parallel 只使用其免密钥端点** —— 请求不携带凭据，并按 IP 限流；没有经过认证的 Parallel 路径。
- **SearXNG 只发送匿名请求** —— 该适配器没有基本认证或 bearer 令牌配置。
- **DuckDuckGo 抓取的是一个 HTML 前端** —— 在封锁其主机名或向其返回机器人检测质询的网络上不可用，此时本链依赖其他引擎。
- **不是已配置提供方的本链可能使选择产生歧义** —— 在未配置 `searchProvider` 的情况下，一个可用但不是模型路由所指派的 DeepSeek 提供方会留下两个可用提供方，seam 将报告 `WEB_PROVIDER_AMBIGUOUS`，直到配置其中之一。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
