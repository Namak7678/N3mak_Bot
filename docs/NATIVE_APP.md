# Atlantis-X native application and release boundary

## What can be installed now

The web client is an installable Progressive Web App. It provides a standalone window, OS launcher/home-screen icon, cached application shell and platform-specific installation guidance. The service worker never caches `/api` responses.

- **Windows:** install from Edge or Chrome; Atlantis-X appears in Start and can create a desktop shortcut.
- **Android:** install from Chrome through the browser prompt or **Add to Home screen**.
- **iOS/iPadOS:** Safari → Share → **Add to Home Screen**. Apple does not expose the generic browser install prompt used by Chromium.
- **macOS/Linux:** install from a browser that supports PWA installation.

A PWA still connects to its hosted Atlantis-X API. It does not receive unrestricted desktop privileges. The prominent device-install action in the Command Center opens these genuine PWA installation paths; it does not claim to download an unsigned native package.

## Native source foundation

`src-tauri` is a Tauri 2 native shell intended for Windows, macOS, Linux, Android and iOS. Its Rust source now defines:

- full-database SQLCipher encryption and Argon2 key derivation from a user-entered passphrase;
- first-run creation, unlock, explicit memory lock, key zeroization, and a clear no-recovery boundary;
- encrypted schema-v2 records for goals, tasks, workflows, audit events, providers, skills, migration bundles, organizations, members and recurring workflows;
- the coordinated `PLAN → EXECUTE → REVIEW → SECURITY → APPROVAL → RELEASE → COMPLETE` runtime;
- an audited local Agent2Agent handoff ledger, with no external A2A transport enabled;
- sovereign approval stops for high-risk directives;
- 22 provider catalog entries, of which 21 map to implemented protocol families and remain unconfigured by default; AWS Bedrock is visibly catalog-only until a native SigV4 adapter exists;
- BYOK storage in SQLCipher, strict endpoint validation at configuration and request time, hosted-provider host pinning, redirect rejection, a 1 MiB chat-response ceiling, real health requests, stale-health invalidation, and a database constraint that blocks enablement until permission, health and rollback gates all pass;
- `SKILL.md` installation, disabled by default;
- encrypted migration staging for agents, prompts, memories, skills and settings. Supported entries are normalized into category records, credential-, token-, password-, secret- and private-key-named fields are stripped recursively, and every imported record remains disabled;
- organizations containing agent, human and registered-device identity records; device entries are not represented as authenticated pairings;
- recurring goals that are disabled on creation and run only while the unlocked application process is active;
- no external desktop, browser, publishing, payment or deployment automation command.

This native source is deliberately separate from the development web server's unencrypted SQLite database. Secrets must never be copied into the browser runtime store.

The source package metadata is reconciled at **2.4.0**, and native state identifies the engine as `2.4.0-native`. These values describe the source revision only; they are not evidence of compilation, signing, installation, or target-device verification.

The Rust source has not been compiled in this repository environment because Rust and the platform GUI SDKs are unavailable here. Dependency installation and `npm run native:info` do work with the pinned Tauri CLI 2.11.4; the diagnostic explicitly reports missing `rustc`, Cargo, `webkit2gtk-4.1`, and `rsvg2`. A direct `npm run native:build` attempt stops before compilation when Tauri cannot run `cargo metadata`. Android and Apple SDK/signing tools are also absent. It must pass compilation and target-device validation before it is described as a distributable native application.

## Why signed binaries are not committed

A trustworthy native release requires platform-controlled build and signing:

| Platform | Output | Required trusted builder |
|---|---|---|
| Windows | `.msi`, setup `.exe` | Windows runner and Authenticode certificate |
| Android | `.apk`, Play Store `.aab` | Android SDK/NDK, Java, release keystore |
| iOS | TestFlight/App Store archive | macOS, Xcode, Apple Developer certificate and provisioning profile |
| macOS | `.app`, `.dmg` | macOS, Developer ID and notarization credentials |
| Linux | AppImage/deb/rpm | Linux Rust/WebKit toolchain |

These credentials must be held in the release platform's encrypted secret store. They must not be requested in chat, embedded in source, or committed to Git.

## Maintainer build preparation

The repository pins the Tauri CLI through `package-lock.json`. Maintainer commands—not end-user installation steps—are:

```text
npm ci
npm run native:build
npm run native:android:init
npm run native:android:build
npm run native:ios:init
npm run native:ios:build
```

Android initialization/build must run on a machine with the Android SDK and NDK. iOS initialization/build must run on macOS. A release workflow should publish checksums and signatures alongside every artifact.

## Validation still required before a public native release

The repository contains a native implementation source tree, not a falsely labeled finished store binary. Before publishing:

1. Compile and type-check the Rust/Tauri source on every supported desktop and mobile target.
2. Run SQLCipher upgrade, wrong-key, crash-recovery, concurrent scheduler and destructive-reset/export tests.
3. Test every advertised provider adapter against a user-controlled account; keep untested or protocol-specific catalog entries unavailable.
4. Generate Tauri Android and Apple projects with official tooling and test mobile vault lifecycle/background suspension behavior.
5. Add OS-specific secure key or biometric wrapping where appropriate.
6. Add platform permission explanations and retain deny-by-default capability prompts for browser, desktop, codework and other external automation.
7. Complete code signing, Apple notarization, Play Integrity/App Store review material, checksums, privacy disclosures and update infrastructure.
8. Run keyboard, screen-reader, RTL, responsive, offline and recovery validation on real devices.

Until those checks pass, the UI exposes genuine PWA installation and clearly states that signed `.exe`, `.apk`, `.aab` and `.ipa` downloads are unavailable. No icon or placeholder file is represented as a native application.
