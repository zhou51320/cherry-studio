## Why

The current experimental Windows 7 package can be built with a patched Electron runtime, but it fails at startup on Windows 7 when the main process loads native Node addons that import Win8+ APIs. The Win7 build needs an explicit compatibility contract that covers Electron, native dependencies, startup behavior, and supported feature fallbacks instead of relying on runtime replacement alone.

## What Changes

- Add a Win7-compatible build capability that defines the supported behavior for a dedicated Windows 7 x64 package.
- Require static native-binary auditing for Win7-incompatible imports before publishing a Win7 artifact.
- Require runtime startup verification on a Windows 7 x64 environment for the packaged app.
- Replace, rebuild, lazy-load, or disable incompatible native modules in the Win7 package without changing normal desktop builds.
- Define graceful feature degradation for Win7-only limitations, especially database, OCR, canvas/image processing, and selection-related native modules.
- Document the Win7 support matrix and the exact native-module decisions used by the package.

## Capabilities

### New Capabilities

- `win7-compatible-build`: Dedicated Windows 7 x64 package behavior, native dependency compatibility, startup requirements, verification, and Win7-only feature fallback rules.

### Modified Capabilities

- None.

## Impact

- Build scripts and CI for the Win7 package path.
- Electron Builder configuration and Win7-specific packaging hooks.
- Main-process startup and lifecycle behavior around native modules.
- SQLite/libsql database layer or a Win7-compatible database substitute for the Win7 build.
- Optional native modules including `@libsql/win32-x64-msvc`, `@napi-rs/canvas-win32-x64-msvc`, `@napi-rs/system-ocr-win32-x64-msvc`, `sharp`/`libvips`, `selection-hook`, and `@paymoapp/electron-shutdown-handler`.
- Documentation in `WINDOWS7_BUILD.md` and any generated runtime/native audit reports.
