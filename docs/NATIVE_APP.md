# Atlantis-X native application and release boundary

## What can be installed now

The web client is an installable Progressive Web App. It provides a standalone window, OS launcher/home-screen icon, cached application shell and platform-specific installation guidance. The service worker never caches `/api` responses.

- **Windows:** install from Edge or Chrome; Atlantis-X appears in Start and can create a desktop shortcut.
- **Android:** install from Chrome through the browser prompt or **Add to Home screen**.
- **iOS/iPadOS:** Safari → Share → **Add to Home Screen**. Apple does not expose the generic browser install prompt used by Chromium.
- **macOS/Linux:** install from a browser that supports PWA installation.

A PWA still connects to its hosted Atlantis-X API. It does not receive unrestricted desktop privileges.

## Native source foundation

`src-tauri` is a Tauri 2 native shell intended for Windows, macOS, Linux, Android and iOS. Its Rust vault provides:

- full-database SQLCipher encryption;
- Argon2 key derivation from a user-entered vault passphrase;
- WAL, foreign keys, full synchronous durability and busy timeout;
- schemas for goals, recurring schedules, skills, capability grants and audit events;
- a database constraint that prevents any capability from becoming enabled unless permission, health and rollback gates are all true;
- explicit memory lock that drops and zeroizes the retained key;
- first-run vault creation that requires the passphrase twice and clearly states the no-recovery boundary;
- no external automation command.

This foundation is deliberately separate from the development web server's unencrypted SQLite database. Secrets must never be copied into the web runtime store.

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

## Native integration still required before a public store release

The current Tauri vault is a security and persistence foundation, not a falsely labeled finished store binary. Before publishing a native release:

1. Port or bridge the complete Orion workflow API into Rust commands.
2. Add a deliberate destructive-reset/export flow around the implemented first-run, no-recovery, unlock and lock screens.
3. Generate Tauri Android and Apple projects with official tooling.
4. Add OS-specific secure key/biometric wrapping where available.
5. Run SQLCipher compatibility, migration, crash-recovery and wrong-key tests on every target.
6. Add platform permission explanations and deny-by-default capability prompts.
7. Complete code signing, Apple notarization, Play Integrity/App Store review material and privacy disclosures.
8. Run accessibility, offline, background scheduling and mobile lifecycle tests.

Until those checks pass, the UI labels PWA installation as available and native signed downloads as unavailable. This prevents an unsigned placeholder from being mistaken for a production application.
