import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electronVersion = process.env.CHERRY_STUDIO_WIN7_ELECTRON_VERSION ?? '40.2.0'
const strictNativeVerification = process.env.CHERRY_STUDIO_WIN7_STRICT_NATIVE === '1'
const useShell = process.platform === 'win32'
let stagedElectronDist: string | undefined
const electronDist = process.env.CHERRY_STUDIO_WIN7_ELECTRON_DIST
  ? normalizeElectronDist(process.env.CHERRY_STUDIO_WIN7_ELECTRON_DIST)
  : undefined

const env = {
  ...process.env,
  CHERRY_STUDIO_WIN7: '1',
  CHERRY_STUDIO_TARGET_PLATFORM: 'win32',
  CHERRY_STUDIO_TARGET_ARCH: 'x64',
  npm_config_platform: 'win32',
  npm_config_arch: 'x64',
  npm_config_ignore_scripts: 'true'
}

const builderArgs = [
  'exec',
  'electron-builder',
  '--win',
  '--x64',
  '--dir',
  '--config',
  'electron-builder.yml',
  '--config.directories.output=dist/win7',
  `--config.electronVersion=${electronVersion}`,
  '--config.npmRebuild=false',
  '--config.win.signAndEditExecutable=false'
]

if (electronDist) builderArgs.push(`--config.electronDist=${electronDist}`)

type Win7NativeDecision = {
  match: string
  decision: 'patched' | 'disabled-on-win7' | 'lazy-loaded-risk' | 'lazy-loaded'
  note: string
}

type PeImport = {
  dll: string
  name: string
}

type PeImports = {
  dlls: Set<string>
  functions: Set<string>
  imports: PeImport[]
}

type NativeAuditEntry = {
  file: string
  format: 'pe' | 'non-pe'
  riskyImports: PeImport[]
  decision: string
  note?: string
}

const win7UnsupportedFunctions = new Set([
  'CreateFile2',
  'CreatePseudoConsole',
  'GetSystemTimePreciseAsFileTime',
  'ProcessPrng',
  'WaitOnAddress',
  'WakeByAddressAll',
  'WakeByAddressSingle'
])

const win7UnsupportedDllPrefixes = [
  'api-ms-win-core-synch-l1-2-0',
  'api-ms-win-core-winrt',
  'api-ms-win-core-winrt-error',
  'bcryptprimitives'
]

const nativeAuditDecisions: Win7NativeDecision[] = [
  {
    match: 'node_modules/@libsql/win32-x64-msvc/index.node',
    decision: 'patched',
    note: 'Win7 package replaces the official libsql native addon with src/patch/windows7/@libsql/win32-x64-msvc/index.node.'
  },
  {
    match: 'node_modules/libsql/node_modules/@libsql/win32-x64-msvc/index.node',
    decision: 'patched',
    note: 'Nested libsql native addon is also replaced with the Win7-compatible patch before packaging.'
  },
  {
    match: 'node_modules/@napi-rs/system-ocr-win32-x64-msvc/system-ocr.win32-x64-msvc.node',
    decision: 'disabled-on-win7',
    note: 'System OCR is not registered on Windows 7 and the native module is dynamically imported only when used.'
  },
  {
    match: 'node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node',
    decision: 'lazy-loaded-risk',
    note: 'Canvas is not required for startup; keep as a documented Win7 optional-feature risk until replaced or disabled.'
  },
  {
    match: 'node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64.node',
    decision: 'disabled-on-win7',
    note: 'Sharp-backed OCR image preprocessing is skipped on Windows 7 before the native module is imported.'
  },
  {
    match: 'node_modules/selection-hook/prebuilds/win32-x64/selection-hook.node',
    decision: 'lazy-loaded',
    note: 'Selection hook remains lazy-loaded and is not required for startup.'
  },
  {
    match: 'node_modules/@paymoapp/electron-shutdown-handler/build/Release/PaymoWinShutdownHandler.node',
    decision: 'disabled-on-win7',
    note: 'Windows shutdown hook loading is skipped on Windows 7 before the native module is imported.'
  }
]

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

async function main() {
  if (!electronDist) {
    console.warn('CHERRY_STUDIO_WIN7_ELECTRON_DIST is not set; packaging with official Electron, not a Win7 runtime.')
  }

  console.log(`Packaging Win7 desktop build with Electron ${electronVersion}`)
  if (electronDist) console.log(`Using Electron dist: ${electronDist}`)

  await run('pnpm', builderArgs, env)
  await applyCherryIcon()
  await verifyWin7Package()
}

function normalizeElectronDist(input: string) {
  const dir = path.resolve(input)
  if (!existsSync(path.join(dir, 'version'))) throw new Error(`Electron dist is missing version file: ${dir}`)
  if (existsSync(path.join(dir, 'electron.exe'))) return dir
  if (!existsSync(path.join(dir, 'CherryStudio.exe'))) {
    throw new Error(`Electron dist must contain electron.exe or CherryStudio.exe: ${dir}`)
  }

  const staged = mkdtempSync(path.join(tmpdir(), 'cherry-studio-win7-electron-'))
  stagedElectronDist = staged
  cpSync(dir, staged, { recursive: true })
  renameSync(path.join(staged, 'CherryStudio.exe'), path.join(staged, 'electron.exe'))
  return staged
}

async function applyCherryIcon() {
  const exe = path.resolve('dist/win7/win-unpacked/CherryStudio.exe')
  const icon = path.resolve('build/icon.ico')
  if (!existsSync(exe) || !existsSync(icon)) return

  let resedit: any
  try {
    resedit = require('resedit')
  } catch {
    console.warn('resedit is not available; skipping Win7 executable icon patch.')
    return
  }

  const { Data, NtExecutable, NtExecutableResource, Resource } = resedit
  const parsed = NtExecutable.from(readFileSync(exe), { ignoreCert: true })
  const resources = NtExecutableResource.from(parsed)
  const icons = Data.IconFile.from(readFileSync(icon)).icons.map((item) => item.data)
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries)
  if (!groups.length) throw new Error(`Win7 icon patch failed; no icon group found in ${exe}`)

  for (const group of groups) {
    Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons)
  }

  resources.outputResource(parsed)
  writeFileSync(exe, Buffer.from(parsed.generate()))
  console.log(`Applied Cherry Studio icon to ${exe}`)
}

async function verifyWin7Package() {
  const app = path.resolve('dist/win7/win-unpacked')
  const resources = path.join(app, 'resources')
  const archive = path.join(resources, 'app.asar')
  const unpacked = path.join(resources, 'app.asar.unpacked')
  const exe = path.join(app, 'CherryStudio.exe')

  for (const file of [
    exe,
    archive,
    path.join(app, 'libEGL.dll'),
    path.join(app, 'libGLESv2.dll'),
    path.join(app, 'ffmpeg.dll'),
    path.join(app, 'version')
  ]) {
    if (!existsSync(file)) throw new Error(`Win7 package verification failed; missing ${file}`)
  }

  const header = await readPeVersions(exe)
  if (header.os !== '5.2' || header.subsystem !== '5.2') {
    throw new Error(
      `Win7 package verification failed; CherryStudio.exe is PE os=${header.os} subsystem=${header.subsystem}`
    )
  }

  const imports = await readPeImports(exe)
  for (const item of ['GetSystemTimePreciseAsFileTime', 'CreateFile2', 'CreatePseudoConsole']) {
    if (imports.functions.has(item))
      throw new Error(`Win7 package verification failed; CherryStudio.exe imports ${item}`)
  }
  for (const item of imports.dlls) {
    if (item.toLowerCase().startsWith('api-ms-win-core-winrt-error')) {
      throw new Error(`Win7 package verification failed; CherryStudio.exe imports ${item}`)
    }
  }

  verifyNativePackageFiles(unpacked)
  await auditNativeBinaries(app)
  console.log(`Verified Win7 desktop package at ${app}`)
}

function verifyNativePackageFiles(unpacked: string) {
  if (!existsSync(unpacked)) throw new Error(`Win7 package verification failed; missing ${unpacked}`)

  const files = walk(unpacked).map((file) => file.replaceAll(path.sep, '/'))
  const required = [
    'node_modules/@img/sharp-win32-x64',
    'node_modules/@libsql/win32-x64-msvc',
    'node_modules/@napi-rs/canvas-win32-x64-msvc',
    'node_modules/@napi-rs/system-ocr-win32-x64-msvc',
    'node_modules/selection-hook'
  ]
  const optional = ['node_modules/@paymoapp/electron-shutdown-handler/build/Release/PaymoWinShutdownHandler.node']

  for (const item of required) {
    if (!files.some((file) => file.includes(item))) {
      throw new Error(`Win7 package verification failed; native package is missing ${item}`)
    }
  }

  for (const item of optional) {
    if (files.some((file) => file.includes(item))) continue

    const message = `Win7 package verification warning; optional native package is missing ${item}`
    if (strictNativeVerification) throw new Error(message)
    console.warn(`${message}. Windows shutdown hooks will be disabled.`)
  }
}

function walk(dir: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry)
    const stat = statSync(file)
    if (stat.isDirectory()) result.push(...walk(file))
    else result.push(file)
  }
  return result
}

async function auditNativeBinaries(app: string) {
  const candidates = walk(app).filter((file) => /\.(exe|dll|node)$/i.test(file))
  const entries: NativeAuditEntry[] = []
  const failures: string[] = []

  for (const file of candidates) {
    const relativePath = path.relative(app, file).replaceAll(path.sep, '/')
    if (!isPeFile(file)) {
      entries.push({
        file: relativePath,
        format: 'non-pe',
        riskyImports: [],
        decision: 'not-applicable',
        note: 'Skipped because this native file is not a Windows PE binary.'
      })
      continue
    }

    const imports = await readPeImports(file)
    const riskyImports = collectWin7RiskyImports(imports)
    const decision = nativeAuditDecisions.find((item) => relativePath.includes(item.match))

    entries.push({
      file: relativePath,
      format: 'pe',
      riskyImports,
      decision: decision?.decision ?? (riskyImports.length ? 'unapproved' : 'compatible'),
      note: decision?.note
    })

    if (riskyImports.length && !decision) {
      failures.push(`${relativePath}: ${riskyImports.map((item) => `${item.dll}!${item.name}`).join(', ')}`)
    }
    if (riskyImports.length && decision?.decision === 'patched') {
      failures.push(
        `${relativePath}: patched native binary still has risky imports ${riskyImports
          .map((item) => `${item.dll}!${item.name}`)
          .join(', ')}`
      )
    }
  }

  const reportDir = path.resolve('dist/win7')
  const jsonPath = path.join(reportDir, 'native-audit.json')
  const mdPath = path.join(reportDir, 'native-audit.md')
  writeFileSync(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2)}\n`)
  writeFileSync(mdPath, renderNativeAuditMarkdown(entries))
  console.log(`Wrote Win7 native audit report to ${jsonPath}`)

  if (failures.length) {
    throw new Error(`Win7 native audit failed:\n${failures.join('\n')}`)
  }
}

function isPeFile(file: string) {
  const bytes = readFileSync(file)
  if (bytes.length < 0x40) return false
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const peOffset = view.getUint32(0x3c, true)
  return peOffset + 4 <= bytes.length && bytes[peOffset] === 0x50 && bytes[peOffset + 1] === 0x45
}

function collectWin7RiskyImports(imports: PeImports) {
  const riskyImports: PeImport[] = []

  for (const dll of imports.dlls) {
    const normalized = dll.toLowerCase().replace(/\.dll$/, '')
    if (win7UnsupportedDllPrefixes.some((prefix) => normalized.startsWith(prefix))) {
      riskyImports.push({ dll, name: '*' })
    }
  }

  for (const { dll, name } of imports.imports) {
    if (win7UnsupportedFunctions.has(name)) {
      riskyImports.push({ dll, name })
    }
  }

  return riskyImports
}

function renderNativeAuditMarkdown(entries: NativeAuditEntry[]) {
  const lines = ['# Win7 Native Audit', '', `Generated: ${new Date().toISOString()}`, '']
  for (const entry of entries) {
    lines.push(`## ${entry.file}`, '')
    lines.push(`- Format: ${entry.format}`)
    lines.push(`- Decision: ${entry.decision}`)
    if (entry.note) lines.push(`- Note: ${entry.note}`)
    if (entry.riskyImports.length) {
      lines.push('- Risky imports:')
      for (const item of entry.riskyImports) {
        lines.push(`  - ${item.dll}!${item.name}`)
      }
    } else {
      lines.push('- Risky imports: none')
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(command, args, { env, shell: useShell, stdio: 'inherit' })
    child.on('error', (error) => {
      console.error(error)
      resolve(1)
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })

  if (exitCode !== 0) throw new Error(`Command failed: ${command} ${args.join(' ')}`)
}

async function readPeVersions(file: string) {
  const bytes = readFileSync(file)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const peOffset = view.getUint32(0x3c, true)
  const optionalHeader = peOffset + 24
  return {
    os: `${view.getUint16(optionalHeader + 40, true)}.${view.getUint16(optionalHeader + 42, true)}`,
    subsystem: `${view.getUint16(optionalHeader + 48, true)}.${view.getUint16(optionalHeader + 50, true)}`
  }
}

async function readPeImports(file: string): Promise<PeImports> {
  const bytes = readFileSync(file)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const peOffset = view.getUint32(0x3c, true)
  const sections = view.getUint16(peOffset + 6, true)
  const optionalHeader = peOffset + 24
  const optionalHeaderSize = view.getUint16(peOffset + 20, true)
  const magic = view.getUint16(optionalHeader, true)
  const dataDirectories = optionalHeader + (magic === 0x20b ? 112 : 96)
  const importRva = view.getUint32(dataDirectories + 8, true)
  const sectionTable = optionalHeader + optionalHeaderSize
  const dlls = new Set<string>()
  const functions = new Set<string>()
  const imports: PeImport[] = []

  if (importRva === 0) return { dlls, functions, imports }

  const rvaToOffset = (rva: number) => {
    for (let i = 0; i < sections; i++) {
      const section = sectionTable + i * 40
      const virtualSize = view.getUint32(section + 8, true)
      const virtualAddress = view.getUint32(section + 12, true)
      const rawSize = view.getUint32(section + 16, true)
      const rawPointer = view.getUint32(section + 20, true)
      const size = Math.max(virtualSize, rawSize)
      if (rva >= virtualAddress && rva < virtualAddress + size) return rawPointer + (rva - virtualAddress)
    }
    throw new Error(`RVA 0x${rva.toString(16)} is outside PE sections`)
  }

  const readString = (offset: number) => {
    const bytes: number[] = []
    for (let i = offset; i < view.byteLength; i++) {
      const byte = view.getUint8(i)
      if (byte === 0) break
      bytes.push(byte)
    }
    return new TextDecoder('ascii').decode(new Uint8Array(bytes))
  }

  for (let descriptor = rvaToOffset(importRva); descriptor + 20 <= view.byteLength; descriptor += 20) {
    const originalFirstThunk = view.getUint32(descriptor, true)
    const nameRva = view.getUint32(descriptor + 12, true)
    const firstThunk = view.getUint32(descriptor + 16, true)
    if (originalFirstThunk === 0 && nameRva === 0 && firstThunk === 0) break

    const dll = readString(rvaToOffset(nameRva))
    dlls.add(dll)
    const thunkOffset = rvaToOffset(originalFirstThunk || firstThunk)
    for (let thunk = thunkOffset; thunk + 8 <= view.byteLength; thunk += 8) {
      const value = magic === 0x20b ? view.getBigUint64(thunk, true) : BigInt(view.getUint32(thunk, true))
      if (value === 0n) break
      const ordinalFlag = magic === 0x20b ? 0x8000000000000000n : 0x80000000n
      if ((value & ordinalFlag) !== 0n) continue
      const name = readString(rvaToOffset(Number(value)) + 2)
      functions.add(name)
      imports.push({ dll, name })
    }
  }

  return { dlls, functions, imports }
}

process.on('exit', () => {
  if (stagedElectronDist) rmSync(stagedElectronDist, { recursive: true, force: true })
})
