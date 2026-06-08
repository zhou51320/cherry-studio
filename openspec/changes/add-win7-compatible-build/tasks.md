## 1. Baseline Audit

- [x] 1.1 Extend or add a Win7 native binary audit script that scans packaged `.exe`, `.dll`, and `.node` files and reports unsupported Windows 7 imports with file path, DLL, and procedure name.
- [ ] 1.2 Run the audit against the current Win7 package and record the baseline incompatible native modules, including `@libsql`, `@napi-rs/canvas`, `@napi-rs/system-ocr`, `sharp`/`libvips`, `selection-hook`, and shutdown hook binaries.
- [x] 1.3 Add a Win7 native-module decision list that classifies each affected module as compatible, replaced, rebuilt, lazy-loaded, or disabled.

## 2. Startup-Critical Database Compatibility

- [x] 2.1 Choose the Win7 database implementation approach and document why it preserves the SQLite-backed DataApi contract.
- [x] 2.2 Implement the Win7-only database dependency replacement or compatible native binary selection without changing normal desktop builds.
- [ ] 2.3 Verify DbService startup, migrations, seeding, write serialization, and existing DataApi tests against the chosen Win7 database path.
- [ ] 2.4 Build the Win7 package and confirm the database native binary no longer imports unsupported Windows 7 procedures.

## 3. Optional Native Feature Isolation

- [x] 3.1 Ensure OCR native modules are lazy-loaded and disabled or replaced on Win7 before incompatible binaries can be loaded.
- [x] 3.2 Ensure canvas/image preprocessing and compression native modules are lazy-loaded and disabled or replaced on Win7 before incompatible binaries can be loaded.
- [x] 3.3 Ensure selection and shutdown hook native modules keep their existing lazy-load behavior and have explicit Win7 audit decisions.
- [x] 3.4 Route all Win7 feature-disable and replacement decisions through centralized logging with enough context to diagnose user reports.

## 4. Packaging and CI Gates

- [x] 4.1 Wire the native audit into the Win7 package verification path so unapproved incompatible imports fail the Win7 artifact.
- [x] 4.2 Generate and retain a Win7 native audit report for packaged artifacts.
- [ ] 4.3 Add a release or CI gate that requires Windows 7 SP1 x64 smoke-test evidence before publishing a Win7-compatible artifact.

## 5. Runtime Verification

- [ ] 5.1 Launch the packaged app on Windows 7 SP1 x64 with a clean user data directory and verify it reaches the first usable app window.
- [ ] 5.2 Launch the packaged app on Windows 7 SP1 x64 with an existing compatible user data directory and verify persisted core data loads.
- [ ] 5.3 Verify a basic chat/topic/message workflow on Windows 7 without requiring disabled optional native features.
- [ ] 5.4 Capture smoke-test logs or screenshots showing startup, database initialization, and the basic workflow result.

## 6. Documentation

- [x] 6.1 Update `WINDOWS7_BUILD.md` with the selected database strategy, runtime provenance, native audit process, and package commands.
- [x] 6.2 Add or update the Win7 support matrix with supported, replaced, and disabled native-dependent features.
- [x] 6.3 Document known limitations and the minimum verification evidence required before a Win7 artifact is published.
