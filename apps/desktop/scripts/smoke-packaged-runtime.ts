/** Validate the assembled application, including native Office conversion outside ASAR. */
import { existsSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { desktopArtifactOutput, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false }, 'skip-notarization': { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
const linux = target === 'linux-x64'
const artifacts = desktopArtifactOutput(paths, { unsigned: values.unsigned, skipNotarization: values['skip-notarization'] }).directory
const application = windows ? join(artifacts, 'win-unpacked')
  : linux ? join(artifacts, 'linux-unpacked')
  : join(artifacts, target === 'mac-arm64' ? 'mac-arm64' : 'mac', 'DeepSeek Harness.app', 'Contents')
const resources = join(application, windows || linux ? 'resources' : 'Resources')
const executable = windows ? join(application, 'DeepSeek Harness.exe')
  : linux ? join(application, 'deepseek-harness')
  : join(application, 'MacOS', 'DeepSeek Harness')
const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version,
  resolveDesktopPackageTarget(target))
if (windows && !values.unsigned) await verifyWindowsCode(application)

// The Linux Host is the payload's bundled standalone Node, which cannot read ASAR, so the dsh
// tree ships as real files under resources while the archive keeps sealing the Electron shell.
const dsh = linux ? join(resources, 'dsh') : join(resources, 'app.asar', 'dsh')
const node = linux ? join(resources, 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin', 'node') : executable
if (linux) {
  await verifyShellAsar(join(resources, 'app.asar'))
  if (!existsSync(node)) throw new Error(`desktop package: the payload's bundled Node is missing at ${node}`)
}
await smokePreparedRuntime(dsh, node, join(resources, 'runtime'), descriptor)

/**
 * Confirm the Linux archive still seals the Electron shell after the dsh tree moved beside it.
 * @param archive - Packaged application archive.
 */
async function verifyShellAsar(archive: string): Promise<void> {
  const handle = await open(archive, 'r')
  try {
    const prefix = Buffer.alloc(16)
    if ((await handle.read(prefix, 0, prefix.length, 0)).bytesRead !== prefix.length) {
      throw new Error(`desktop package: truncated application archive ${archive}`)
    }
    const headerSize = prefix.readUInt32LE(12)
    const header = Buffer.alloc(headerSize)
    if ((await handle.read(header, 0, headerSize, prefix.length)).bytesRead !== headerSize) {
      throw new Error(`desktop package: truncated application archive header ${archive}`)
    }
    const files = (JSON.parse(header.toString('utf8')).files ?? {}) as Record<string, unknown>
    for (const entry of ['package.json', 'lib', 'renderer']) {
      if (!(entry in files)) throw new Error(`desktop package: application archive is missing ${entry} (${archive})`)
    }
    if ('dsh' in files) throw new Error('desktop package: the Linux archive must not carry the dsh tree; the Host reads real files under the bundled Node')
  } finally {
    await handle.close()
  }
}
