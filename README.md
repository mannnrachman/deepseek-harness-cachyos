# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

## Linux desktop (Arch/CachyOS fork build)

This fork adds an unsigned Linux x64 desktop target with a validated Linux runtime. Requirements (Node.js ≥ 24.9):

```sh
sudo pacman -S --needed nodejs npm pnpm git base-devel
```

Run from this checkout after `pnpm install && pnpm run build`:

```sh
pnpm run start:desktop      # Electron desktop window (development layout)
pnpm run start:web          # the same UI served at http://127.0.0.1:3080
```

Build and install the packaged desktop app:

```sh
pnpm run package:desktop:linux:x64:dir
rm -rf ~/.local/opt/deepseek-harness
cp -a apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/linux-unpacked ~/.local/opt/deepseek-harness
```

Point a menu entry at `~/.local/opt/deepseek-harness/deepseek-harness`, or run `./update-desktop.sh` to pull, rebuild, repackage and reinstall in one step. The full pipeline (payload smoke, Host boot, DOCX/XLSX/PPTX→PDF conversion) runs as part of packaging.

Notes:

- The Linux Host runs under the payload's bundled standalone Node: Electron's Linux binary links the system glib that collides with the prebuilt sharp binding and SIGSEGVs at the first image decode ([electron#46323](https://github.com/electron/electron/issues/46323)). Running the Host on plain Node removes the crash class; image attachments work.
- The LibreOffice engine resolver takes its WASM fallback on Linux because upstream publishes no native Linux engine package.
- The packaged app shows the "DSH Local Build" label; the official branding is reserved for signed builds.
- On networks where GitHub release assets return 504, prefix the packaging or Electron download commands with `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`.
- Web and desktop keep separate Harness homes, so sessions, credentials and plugins do not cross over.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/4MrtZUhpxg">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

`pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal, and `make help` lists the matching Make targets for Web and Desktop; the guide's application commands section owns the full table.

For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
