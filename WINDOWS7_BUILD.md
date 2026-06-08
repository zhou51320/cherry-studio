# Windows 7 Desktop Build

This document describes the experimental Windows 7 x64 package path for Cherry Studio.
It builds Cherry Studio from the current source tree and packages it with a verified
Windows 7 patched Electron runtime.

## Runtime

Use the `e3kskoy7wqk/Electron-for-windows-7` release asset:

- Release: `v40.2.0`
- Asset: `dist.zip`
- URL: `https://github.com/e3kskoy7wqk/Electron-for-windows-7/releases/download/v40.2.0/dist.zip`
- SHA-256: `ed4ebb022624ae38f764fcfc1dc1ce30fe2145298975d4c90e8d95412deeadea`

The extracted archive must contain `electron.exe`, `version`, `ffmpeg.dll`,
`libEGL.dll`, `libGLESv2.dll`, `locales/`, and the other runtime files expected
by `electron-builder`.

## Local Build

From the repository root:

```bash
pnpm install
pnpm build:win7
CHERRY_STUDIO_WIN7_ELECTRON_DIST=/absolute/path/to/extracted/electron-win7-runtime pnpm package:win7
```

The unpacked package is written to:

```text
dist/win7/win-unpacked
```

If downloads need a proxy:

```bash
export HTTP_PROXY=http://192.168.2.254:7891
export HTTPS_PROXY=http://192.168.2.254:7891
```

To inspect runtime provenance:

```bash
pnpm report:win7-runtime /absolute/path/to/extracted/electron-win7-runtime --out dist/win7/prebuilt-runtime
pnpm report:win7-runtime dist/win7/win-unpacked --compare /absolute/path/to/extracted/electron-win7-runtime --out dist/win7/prebuilt-runtime-comparison
```

`package:win7` also writes a native dependency audit to:

```text
dist/win7/native-audit.json
dist/win7/native-audit.md
```

## Build Notes

- `package:win7` uses `CHERRY_STUDIO_WIN7_ELECTRON_DIST` as `electronDist` and
  pins Electron to `40.2.0`.
- `package:win7` disables `npmRebuild` because `electron-builder` cannot
  cross-compile source native modules from Ubuntu to Windows.
- `before-pack.js` keeps the normal build behavior unchanged. Only when
  `CHERRY_STUDIO_WIN7=1`, it keeps `selection-hook`'s `win32-x64` prebuild and
  unpacks it for runtime loading. It also unpacks
  `@paymoapp/electron-shutdown-handler/build/Release/**` when that native module
  was built on Windows.
- `before-pack.js` also applies a Win7-only `@libsql/win32-x64-msvc/index.node`
  replacement from `src/patch/windows7/@libsql/win32-x64-msvc/index.node`.
  This binary was recovered from the historical
  `origin/build/windows7-support` branch (`Windows7 support V1.4.1`, commit
  `7d74a2330ee8ffb9d5849eb14cccdf9363f6ce77`) and has SHA-256
  `230644b02d628a8c4e5fe6a8a6a711bbd1016a45cf5747a714aca3a8defab380`.
  The replacement avoids the known official `@libsql` Win7 startup blockers:
  `WaitOnAddress`, `WakeByAddressSingle`, `WakeByAddressAll`,
  `GetSystemTimePreciseAsFileTime`, and `bcryptprimitives!ProcessPrng`.
- `@paymoapp/electron-shutdown-handler@1.1.2` does not publish a Win32 x64
  prebuild. Ubuntu packaging cannot produce
  `PaymoWinShutdownHandler.node`; Cherry Studio now loads this module lazily so
  the app can still start, with Windows shutdown hooks disabled if the native
  file is absent. Set `CHERRY_STUDIO_WIN7_STRICT_NATIVE=1` to make packaging fail
  when this native file is missing.
- The package script verifies the patched executable PE header, checks for
  obvious unsupported imports, applies `build/icon.ico` to `CherryStudio.exe`,
  checks key Win32 native files, and audits packaged `.exe`, `.dll`, and `.node`
  files for Windows 7 risk imports.

## Native Support Matrix

| Module / capability | Win7 decision | Notes |
| --- | --- | --- |
| Electron runtime | Supported via patched runtime | Uses the verified `v40.2.0` Win7 runtime above. |
| `@libsql/win32-x64-msvc` | Replaced | Required for startup and SQLite-backed DataApi. The Win7 build patches all installed `@libsql/win32-x64-msvc/index.node` copies before packaging. |
| `@napi-rs/system-ocr` | Disabled on Win7 | System OCR is not registered on Windows 7 and the native module is dynamically imported only when the feature is used. |
| `@napi-rs/canvas` | Known optional risk | Not required for startup. The native audit records the package until a compatible replacement or Win7-specific disable path is chosen. |
| `sharp` / `libvips` | Disabled on Win7 OCR preprocessing paths | OCR image utilities skip Sharp-backed preprocessing on Windows 7 before the native module is imported. |
| `selection-hook` | Lazy-loaded | Win7 packaging keeps the `win32-x64` prebuild and unpacks it for runtime loading. |
| `@paymoapp/electron-shutdown-handler` | Disabled on Win7 | Windows shutdown hook loading is skipped on Windows 7. Missing native file is a warning unless `CHERRY_STUDIO_WIN7_STRICT_NATIVE=1`. |

## CI Build

The Win7-only workflow is:

```text
.github/workflows/win7-desktop-prebuilt.yml
```

It runs on `windows-latest` so `@paymoapp/electron-shutdown-handler` can build
its Win32 x64 N-API addon during `pnpm install`. On push or manual dispatch, it:

1. Installs dependencies.
2. Downloads and verifies the Win7 patched Electron `v40.2.0` runtime.
3. Builds desktop assets for `win32/x64`.
4. Packages with `CHERRY_STUDIO_WIN7_ELECTRON_DIST`.
5. Runs strict native verification and writes `native-audit.*`.
6. Uploads `cherry-studio-win7-prebuilt-electron`.

## Verified Behavior

As of 2026-06-07, this path was verified on Ubuntu to produce:

```text
dist/win7/win-unpacked
```

Static package verification passed for:

- `CherryStudio.exe` PE `os=5.2`, `subsystem=5.2`
- patched runtime files such as `ffmpeg.dll`, `libEGL.dll`, and `libGLESv2.dll`
- Win32 x64 native packages for `sharp`, `@libsql`, `@napi-rs/canvas`,
  `@napi-rs/system-ocr`, and `selection-hook`
- native audit reports in `dist/win7/native-audit.json` and
  `dist/win7/native-audit.md`

Actual startup and feature testing on Windows 7 still requires a Windows 7 x64
machine or VM.
