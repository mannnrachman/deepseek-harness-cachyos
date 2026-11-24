# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

## Linux 桌面（Arch/CachyOS 分支构建）

本分支新增了一个未签名的 Linux x64 桌面目标，并带有经过验证的 Linux 运行时（Node.js ≥ 24.9）。全新机器只需一条命令：

```sh
curl -fsSL https://raw.githubusercontent.com/mannnrachman/deepseek-harness-cachyos/master/install.sh | bash
```

安装脚本会把本仓库克隆到 `~/deepseek-harness-cachyos`，安装前置依赖（Arch：nodejs/npm/pnpm/git/base-devel），构建全部内容，打包桌面应用并注册菜单项。

在仓库目录中的日常命令——`./dsh.sh <command>`：

| 命令 | 作用 |
|---|---|
| `./dsh.sh install` | 首次设置：前置依赖、依赖项、完整构建 |
| `./dsh.sh web` | 在 http://127.0.0.1:3080 运行 Web UI |
| `./dsh.sh desktop` | 运行 Electron 桌面窗口 |
| `./dsh.sh desktop-install` | 打包并安装桌面应用和菜单项 |
| `./dsh.sh update` | 拉取、重新构建、重新安装——你唯一需要的更新命令 |
| `./dsh.sh doctor` | 环境状态 |

手动等价命令仍然可用（`pnpm run start:web`、`pnpm run start:desktop`、`pnpm run package:desktop:linux:x64:dir`）。完整流水线（载荷冒烟测试、Host 启动、DOCX/XLSX/PPTX→PDF 转换）作为打包的一部分运行。

注意：

- Linux Host 运行在载荷自带的独立 Node 之下：Electron 的 Linux 二进制链接系统 glib，它与预构建的 sharp 绑定冲突，并在首次解码图像时触发 SIGSEGV（[electron#46323](https://github.com/electron/electron/issues/46323)）。让 Host 运行在普通 Node 上消除了这类崩溃；图像附件可以正常工作。
- LibreOffice 引擎解析器在 Linux 上采用其 WASM 回退，因为上游没有发布原生 Linux 引擎包。
- 打包后的应用显示“DSH Local Build”标签；官方品牌保留给已签名的构建。
- 在 GitHub release 资源返回 504 的网络中，为打包或 Electron 下载命令加上前缀 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
- Web 和桌面使用各自独立的 Harness 主目录，因此会话、凭据和插件不会互通。
- Web UI 绑定 `127.0.0.1` 并由每次启动生成的令牌保护：启动器打印 `http://127.0.0.1:3080/?token=…` 并用它打开浏览器。端口和令牌在每次重启时都会变化，因此不要收藏该 URL——重新启动并使用新打印的那一行（桌面窗口自动携带其凭据）。传入 `--no-open` 可仅运行服务器而不打开浏览器。
- 网页搜索无需 DeepSeek 账号或 API 密钥：本分支捆绑了 `@deepseek-ai/dsh-web-search-chain`，一条移植自 [oh-my-pi](https://github.com/can1357/oh-my-pi) 提供方链的回退链，并将其配置为默认搜索提供方。它按 Parallel（免密钥）→ DuckDuckGo → SearXNG → Brave → Tavily 的顺序尝试，并返回第一个可用的答案。设置 `SEARXNG_ENDPOINT`、`BRAVE_API_KEY` 或 `TAVILY_API_KEY` 以启用这些引擎，或者在“设置 → 网页搜索”下选择其他提供方以改用 DeepSeek 搜索。

## 社区与支持

- 通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群！扫描下方二维码填写入群问卷，小助手会定期发送入群邀请。

<table>
  <thead>
    <tr>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

`pnpm run dev:web` 会在一个终端里完成构建、启动，并在源码修改时重建 client bundle；`make help` 列出 Web 与 Desktop 对应的 Make target。完整表格见开发指南的「应用命令」一节。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
