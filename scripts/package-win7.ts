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

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(command, args, { env, stdio: 'inherit' })
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

async function readPeImports(file: string) {
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

  if (importRva === 0) return { dlls, functions }

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

    dlls.add(readString(rvaToOffset(nameRva)))
    const thunkOffset = rvaToOffset(originalFirstThunk || firstThunk)
    for (let thunk = thunkOffset; thunk + 8 <= view.byteLength; thunk += 8) {
      const value = magic === 0x20b ? view.getBigUint64(thunk, true) : BigInt(view.getUint32(thunk, true))
      if (value === 0n) break
      const ordinalFlag = magic === 0x20b ? 0x8000000000000000n : 0x80000000n
      if ((value & ordinalFlag) !== 0n) continue
      functions.add(readString(rvaToOffset(Number(value)) + 2))
    }
  }

  return { dlls, functions }
}

process.on('exit', () => {
  if (stagedElectronDist) rmSync(stagedElectronDist, { recursive: true, force: true })
})
