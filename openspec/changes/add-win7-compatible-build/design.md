## Context

Cherry Studio already has an experimental Win7 package path that swaps in a patched Electron runtime. Static and VM testing showed that runtime replacement is insufficient: the packaged app can still fail before the renderer opens because main-process native Node addons load PE imports that Windows 7 does not provide.

The immediate startup blocker is `@libsql/win32-x64-msvc/index.node`, which imports Win8+ APIs such as `WaitOnAddress`, `WakeByAddressSingle`, `WakeByAddressAll`, `GetSystemTimePreciseAsFileTime`, and `GetQueuedCompletionStatusEx`. Other packaged native modules, including `@napi-rs/canvas` and `@napi-rs/system-ocr`, have similar Win7-incompatible imports and must be handled before the Win7 package can be called compatible.

## Goals / Non-Goals

**Goals:**

- Produce a dedicated Windows 7 x64 package that starts successfully on a Windows 7 SP1 x64 test environment.
- Preserve the normal desktop build behavior for supported operating systems.
- Make native binary compatibility explicit and automatically checked in the Win7 package path.
- Keep core app data, provider configuration, and chat workflows available on Win7.
- Gracefully disable or replace Win7-incompatible optional features with clear logging and no startup crash.
- Document the Win7 support matrix and native-module decisions used by each package.

**Non-Goals:**

- Do not make the standard Windows package support Windows 7.
- Do not guarantee feature parity for native features that require Win8+ APIs, WinRT, or GPU/runtime support unavailable on Win7.
- Do not introduce v1 data-layer fallbacks or dual writes.
- Do not add speculative abstractions outside the Win7 package path.

## Decisions

### Decision 1: Treat Win7 as a dedicated build target

The Win7 package remains a separate build path gated by explicit Win7 environment/configuration. This keeps compatibility shims, disabled features, dependency substitutions, and native audit checks out of normal desktop builds.

Alternative considered: make all Windows builds Win7-compatible. That would constrain dependency upgrades and native capabilities for currently supported Windows versions without benefiting the main release path.

### Decision 2: Add a native compatibility audit to the Win7 package

The Win7 package step must scan every packaged `.exe`, `.dll`, and `.node` file for known unsupported imports and fail before publishing when an incompatible native binary is included without an explicit Win7 decision. The audit report should include file path, imported DLL, imported symbol, and the configured decision for that module.

Alternative considered: rely on VM startup testing only. That catches early-load failures, but it misses feature-gated native modules that load later.

### Decision 3: Fix the database startup blocker upstream of app startup

The Win7 build must not package the current incompatible `@libsql/win32-x64-msvc` binary as the database implementation used during startup. The selected implementation vendors the Win7-compatible `@libsql/win32-x64-msvc/index.node` binary from the historical `build/windows7-support` branch and applies it only during Win7 packaging.

This keeps the existing `@libsql/client` API, SQLite-backed DataApi contract, migrations, seeding, and write serialization path unchanged for application code. Normal desktop builds keep the official native dependency.

Alternative considered: catch the `createClient()` failure and continue without a database. That would violate the DataApi contract and break core app behavior.

### Decision 4: Lazy-load and gate optional native modules

Optional native modules that are not required for startup must be loaded only when their feature is used. On Win7, modules with incompatible imports must either be replaced by a compatible implementation or disabled with a user-visible feature state and centralized logging.

This applies at minimum to OCR, canvas/image preprocessing, image compression, selection hook integration, and shutdown hook integration. The exact support decision for each module belongs in the Win7 support matrix.

Alternative considered: remove these packages from all builds. That would unnecessarily reduce functionality on supported platforms.

### Historical Reference: `build/windows7-support`

The historical `CherryHQ/cherry-studio` branch `build/windows7-support` was reviewed as a reference. Its `src/patch/windows7/@libsql/win32-x64-msvc/index.node` binary was recovered from commit `7d74a2330ee8ffb9d5849eb14cccdf9363f6ce77` and has SHA-256 `230644b02d628a8c4e5fe6a8a6a711bbd1016a45cf5747a714aca3a8defab380`.

Static PE import inspection showed that this recovered binary does not import the current startup blockers: `WaitOnAddress`, `WakeByAddressSingle`, `WakeByAddressAll`, `GetSystemTimePreciseAsFileTime`, or `bcryptprimitives!ProcessPrng`. The old branch also had renderer Web API compatibility shims, but those were not ported wholesale because the current v2 codebase and dependency graph have diverged.

### Decision 5: Verify with both static checks and a Win7 runtime smoke test

Static import checks are required but not sufficient. The package must also be launched in a Windows 7 SP1 x64 VM or equivalent environment and verified to reach the first usable app window without a main-process uncaught exception.

The smoke test must cover startup, database initialization, loading existing data, creating a basic chat/topic record, and opening a provider-backed or mocked chat flow where network credentials are not available.

## Risks / Trade-offs

- Win7-compatible database replacement may diverge from `@libsql/client` behavior -> Mitigate with focused DbService/DataApi tests and migration smoke tests.
- Optional feature degradation may be broader than expected -> Mitigate with a documented support matrix and feature-level startup isolation.
- Native import allowlists can become stale -> Mitigate by generating an audit report from the packaged artifact on every Win7 build.
- Windows 7 VM automation may be slower or less reliable than static checks -> Mitigate by keeping static checks mandatory and VM tests focused on smoke coverage.
- Maintaining Win7 compatibility can slow dependency upgrades -> Mitigate by isolating decisions to the Win7 package path and failing only Win7-specific workflows.

## Migration Plan

1. Add the native compatibility audit and run it against the existing Win7 package to establish the baseline failure list.
2. Resolve the database native dependency first so the app can pass startup.
3. Gate or replace optional incompatible native modules one feature at a time.
4. Add Win7 package documentation that lists supported, disabled, and replaced native features.
5. Add CI or release-gate checks for static audit and Win7 smoke evidence before publishing Win7 artifacts.

Rollback is limited to the Win7 package path: keep normal desktop package scripts unchanged, and do not publish Win7 artifacts when the audit or smoke test fails.

## Open Questions

- What Windows 7 SP1 x64 VM image and automation method will CI or release engineering use for smoke validation?
