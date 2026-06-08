## ADDED Requirements

### Requirement: Dedicated Win7 Package Target

The system SHALL provide a dedicated Windows 7 x64 package target whose compatibility behavior is isolated from normal desktop package targets.

#### Scenario: Normal desktop builds are unchanged

- **WHEN** a normal Windows, macOS, or Linux desktop package is built without the Win7 package flag
- **THEN** the build SHALL use the normal runtime, dependencies, packaging hooks, and feature set

#### Scenario: Win7 package uses explicit compatibility mode

- **WHEN** the Win7 package target is built
- **THEN** the build SHALL use explicit Win7 configuration for runtime selection, native dependency handling, and compatibility verification

### Requirement: Native Binary Compatibility Audit

The Win7 package target SHALL audit packaged native binaries for imports that are unavailable on Windows 7 before a Win7 artifact is published.

#### Scenario: Incompatible import is packaged

- **WHEN** a packaged `.exe`, `.dll`, or `.node` imports a configured Windows 7 incompatible DLL or procedure without an explicit Win7 compatibility decision
- **THEN** the Win7 package verification SHALL fail and report the file path, imported DLL, and imported procedure

#### Scenario: Audit report is generated

- **WHEN** Win7 package verification runs
- **THEN** the system SHALL write an audit report that lists audited native binaries, detected risky imports, and the Win7 decision for each affected module

### Requirement: Win7 Startup Compatibility

The Win7 package SHALL start on Windows 7 SP1 x64 and reach the first usable app window without a main-process uncaught exception.

#### Scenario: Main process initializes database

- **WHEN** the Win7 package starts on Windows 7 SP1 x64 with a clean user data directory
- **THEN** the main process SHALL initialize the SQLite-backed data layer, run migrations and seeders, and continue startup without loading a Win7-incompatible database native binary

#### Scenario: Existing user data opens

- **WHEN** the Win7 package starts on Windows 7 SP1 x64 with an existing compatible user data directory
- **THEN** the app SHALL load persisted core data and open the first usable app window without data-layer startup failure

### Requirement: Core Chat Functionality on Win7

The Win7 package SHALL support core chat and data workflows required for basic app use.

#### Scenario: User creates core records

- **WHEN** a user creates or updates basic app records through the Win7 package
- **THEN** the system SHALL persist those records through the same application data contracts used by normal desktop builds

#### Scenario: User opens a basic chat flow

- **WHEN** a user opens a basic chat flow on Windows 7
- **THEN** the app SHALL allow the chat UI and related topic/message data to operate without requiring Win7-incompatible optional native modules

### Requirement: Optional Native Feature Degradation

The Win7 package SHALL gracefully replace or disable optional native features that depend on Win7-incompatible native modules.

#### Scenario: Optional incompatible feature is unavailable

- **WHEN** a Win7-incompatible optional native feature is requested on Windows 7 and no compatible replacement is configured
- **THEN** the app SHALL avoid loading the incompatible native module, expose the feature as unavailable or disabled, and log the decision through centralized logging

#### Scenario: Optional compatible replacement exists

- **WHEN** a compatible replacement is configured for an optional native feature on Windows 7
- **THEN** the app SHALL use the replacement without changing normal desktop behavior

### Requirement: Win7 Support Matrix Documentation

The Win7 package SHALL include documentation that identifies supported, replaced, and disabled native-dependent capabilities.

#### Scenario: Documentation is updated for release

- **WHEN** a Win7 artifact is prepared for release
- **THEN** the documentation SHALL list the Electron runtime, database implementation decision, audited native modules, unsupported imports found or avoided, and feature-level support status

### Requirement: Win7 Runtime Smoke Verification

The Win7 package SHALL require runtime smoke verification on Windows 7 SP1 x64 before being considered compatible.

#### Scenario: Smoke test passes

- **WHEN** the Win7 package is launched in the Windows 7 SP1 x64 smoke environment
- **THEN** verification SHALL capture evidence that startup, database initialization, and a basic chat/data workflow reached the expected usable state

#### Scenario: Smoke test fails

- **WHEN** the Windows 7 SP1 x64 smoke verification encounters a main-process exception, missing procedure error, or unusable first window
- **THEN** the Win7 artifact SHALL be treated as not publishable until the failure is resolved or the affected feature is explicitly disabled before load
