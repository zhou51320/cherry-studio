const { Arch } = require('electron-builder')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { parse, stringify } = require('yaml')

const workspaceConfigPath = path.join(__dirname, '..', 'pnpm-workspace.yaml')
const win7LibsqlPatchPath = path.join(
  __dirname,
  '..',
  'src',
  'patch',
  'windows7',
  '@libsql',
  'win32-x64-msvc',
  'index.node'
)

// if you want to add new prebuild binaries packages with different architectures, you can add them here
// please add to allX64 and allArm64 from pnpm-lock.yaml
const packages = [
  '@anthropic-ai/claude-agent-sdk-darwin-arm64',
  '@anthropic-ai/claude-agent-sdk-darwin-x64',
  '@anthropic-ai/claude-agent-sdk-linux-arm64',
  '@anthropic-ai/claude-agent-sdk-linux-arm64-musl',
  '@anthropic-ai/claude-agent-sdk-linux-x64',
  '@anthropic-ai/claude-agent-sdk-linux-x64-musl',
  '@anthropic-ai/claude-agent-sdk-win32-arm64',
  '@anthropic-ai/claude-agent-sdk-win32-x64',
  '@img/sharp-darwin-arm64',
  '@img/sharp-darwin-x64',
  '@img/sharp-libvips-darwin-arm64',
  '@img/sharp-libvips-darwin-x64',
  '@img/sharp-libvips-linux-arm64',
  '@img/sharp-libvips-linuxmusl-arm64',
  '@img/sharp-libvips-linux-x64',
  '@img/sharp-libvips-linuxmusl-x64',
  '@img/sharp-linux-arm64',
  '@img/sharp-linux-x64',
  '@img/sharp-linuxmusl-arm64',
  '@img/sharp-linuxmusl-x64',
  '@img/sharp-win32-arm64',
  '@img/sharp-win32-x64',
  '@libsql/darwin-arm64',
  '@libsql/darwin-x64',
  '@libsql/linux-arm64-gnu',
  '@libsql/linux-x64-gnu',
  '@libsql/linux-arm64-musl',
  '@libsql/linux-x64-musl',
  '@libsql/win32-x64-msvc',
  '@napi-rs/system-ocr-darwin-arm64',
  '@napi-rs/system-ocr-darwin-x64',
  '@napi-rs/system-ocr-win32-arm64-msvc',
  '@napi-rs/system-ocr-win32-x64-msvc',
  '@napi-rs/canvas-linux-x64-gnu',
  '@napi-rs/canvas-linux-x64-musl',
  '@napi-rs/canvas-linux-arm64-gnu',
  '@napi-rs/canvas-linux-arm64-musl',
  '@napi-rs/canvas-darwin-x64',
  '@napi-rs/canvas-darwin-arm64',
  '@napi-rs/canvas-win32-x64-msvc',
  '@napi-rs/canvas-win32-arm64-msvc',
  '@strongtz/win32-arm64-msvc'
]

const platformToArch = {
  mac: 'darwin',
  windows: 'win32',
  linux: 'linux',
  linuxmusl: 'linuxmusl'
}

exports.default = async function (context) {
  const arch = context.arch === Arch.arm64 ? 'arm64' : 'x64'
  const platformName = context.packager.platform.name
  const platform = platformToArch[platformName]
  const win7Build = process.env.CHERRY_STUDIO_WIN7 === '1'

  if (win7Build) {
    const asarUnpack = context.packager.config.asarUnpack ?? []
    context.packager.config.asarUnpack = [
      ...asarUnpack,
      'node_modules/selection-hook/prebuilds/win32-x64/**',
      'node_modules/@paymoapp/electron-shutdown-handler/build/Release/**'
    ]
  }

  // Download rtk binary for the target platform
  try {
    console.log(`Downloading rtk binary for ${platform}-${arch}...`)
    execSync(`node "${path.join(__dirname, 'download-rtk-binaries.js')}" ${platform} ${arch}`, { stdio: 'inherit' })
  } catch (error) {
    console.warn(`Warning: rtk binary download failed (non-fatal): ${error.message}`)
  }

  const downloadPackages = async () => {
    // Skip if target platform and architecture match current system
    if (platform === process.platform && arch === process.arch) {
      console.log(`Skipping install: target (${platform}/${arch}) matches current system`)
      return
    }

    console.log(`Installing packages for target platform=${platform} arch=${arch}...`)

    // Backup and modify pnpm-workspace.yaml to add target platform support
    const originalWorkspaceConfig = fs.readFileSync(workspaceConfigPath, 'utf-8')
    const workspaceConfig = parse(originalWorkspaceConfig)

    // Add target platform to supportedArchitectures.os
    if (!workspaceConfig.supportedArchitectures.os.includes(platform)) {
      workspaceConfig.supportedArchitectures.os.push(platform)
    }

    // Add target architecture to supportedArchitectures.cpu
    if (!workspaceConfig.supportedArchitectures.cpu.includes(arch)) {
      workspaceConfig.supportedArchitectures.cpu.push(arch)
    }

    const modifiedWorkspaceConfig = stringify(workspaceConfig)
    console.log('Modified workspace config:', modifiedWorkspaceConfig)
    fs.writeFileSync(workspaceConfigPath, modifiedWorkspaceConfig)

    try {
      execSync(`pnpm install`, { stdio: 'inherit' })
    } finally {
      // Restore original pnpm-workspace.yaml
      fs.writeFileSync(workspaceConfigPath, originalWorkspaceConfig)
    }
  }

  await downloadPackages()

  if (win7Build && platform === 'win32' && arch === 'x64') {
    applyWin7LibsqlPatch()
  }

  const excludePackages = async (packagesToExclude) => {
    // 从项目根目录的 electron-builder.yml 读取 files 配置，避免多次覆盖配置导致出错
    const electronBuilderConfigPath = path.join(__dirname, '..', 'electron-builder.yml')
    const electronBuilderConfig = parse(fs.readFileSync(electronBuilderConfigPath, 'utf-8'))
    let filters = electronBuilderConfig.files

    if (win7Build) {
      filters = filters.filter((filter) => filter !== '!node_modules/selection-hook/prebuilds/**/*')
    }

    // add filters for other architectures (exclude them)
    filters.push(...packagesToExclude)

    context.packager.config.files[0].filter = filters
  }

  const arm64KeepPackages = packages.filter((p) => p.includes('arm64') && p.includes(platform))
  const arm64ExcludePackages = packages
    .filter((p) => !arm64KeepPackages.includes(p))
    .map((p) => '!node_modules/' + p + '/**')

  const x64KeepPackages = packages.filter((p) => p.includes('x64') && p.includes(platform))
  const x64ExcludePackages = packages
    .filter((p) => !x64KeepPackages.includes(p))
    .map((p) => '!node_modules/' + p + '/**')

  const excludeRipgrepFilters = ['arm64-darwin', 'arm64-linux', 'x64-darwin', 'x64-linux', 'x64-win32']
    .filter((f) => {
      // On Windows ARM64, also keep x64-win32 for emulation compatibility
      if (platform === 'win32' && context.arch === Arch.arm64 && f === 'x64-win32') {
        return false
      }
      return f !== `${arch}-${platform}`
    })
    .map((f) => '!node_modules/@cherrystudio/ripgrep/vendor/ripgrep/' + f + '/**')

  // Exclude rtk binaries for other platform-arch combinations
  const currentPlatformKey = `${platform}-${arch}`
  const allRtkPlatforms = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64', 'win32-x64']
  const excludeRtkFilters = allRtkPlatforms
    .filter((p) => p !== currentPlatformKey)
    .map((p) => '!resources/binaries/' + p + '/**')
  const selectionHookPrebuildFilters = win7Build
    ? ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64']
        .filter((p) => p !== `${platform}-${arch}`)
        .map((p) => '!node_modules/selection-hook/prebuilds/' + p + '/**')
    : []

  if (context.arch === Arch.arm64) {
    await excludePackages([
      ...arm64ExcludePackages,
      ...excludeRipgrepFilters,
      ...excludeRtkFilters,
      ...selectionHookPrebuildFilters
    ])
  } else {
    await excludePackages([
      ...x64ExcludePackages,
      ...excludeRipgrepFilters,
      ...excludeRtkFilters,
      ...selectionHookPrebuildFilters
    ])
  }
}

function applyWin7LibsqlPatch() {
  if (!fs.existsSync(win7LibsqlPatchPath)) {
    throw new Error(`Win7 libsql patch is missing: ${win7LibsqlPatchPath}`)
  }

  const nodeModulesPath = path.join(__dirname, '..', 'node_modules')
  const patchedTargets = []

  for (const packageDir of findLibsqlWin32PackageDirs(nodeModulesPath)) {
    const target = path.join(packageDir, 'index.node')
    fs.copyFileSync(win7LibsqlPatchPath, target)
    patchedTargets.push(target)
  }

  if (!patchedTargets.length) {
    throw new Error('Win7 libsql patch failed; no @libsql/win32-x64-msvc package directories were found')
  }

  console.log(`[Before Pack] Applied Win7 libsql patch to ${patchedTargets.length} package(s)`)
  for (const target of patchedTargets) {
    console.log(`[Before Pack] Patched ${target}`)
  }
}

function findLibsqlWin32PackageDirs(root) {
  const result = []
  const seen = new Set()

  const visit = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

      const fullPath = path.join(dir, entry.name)
      let realPath
      try {
        realPath = fs.realpathSync(fullPath)
      } catch {
        continue
      }
      if (seen.has(realPath)) continue
      seen.add(realPath)

      if (entry.name === 'win32-x64-msvc' && path.basename(path.dirname(realPath)) === '@libsql') {
        if (fs.existsSync(path.join(realPath, 'index.node'))) {
          result.push(realPath)
        }
        continue
      }

      if (
        entry.name === '.cache' ||
        entry.name === '.bin' ||
        (entry.name !== '.pnpm' && !entry.name.startsWith('@') && dir.endsWith(`${path.sep}node_modules`))
      ) {
        continue
      }

      visit(realPath)
    }
  }

  visit(root)
  return result
}
