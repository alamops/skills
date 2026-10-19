# Build, upload & device lane (incl. iPhone Duo)

What this lane checks: whether the binary will be **accepted at upload**, will **launch and lay out correctly on every iPhone it can run on** — including the foldable iPhone Duo — and whether the deadlines already announced will break the next release.

> Snapshot as of **2026-10-19**, compiled from Apple's developer news, release notes and technotes. Requirements here are dated and some are future. Re-confirm each one against the live `news.md` / `upcoming-requirements.txt` from the fetch script before reporting it; when the live page disagrees, the live page wins.

**Contents:** [Upload blockers](#upload-blockers-in-force) · [Upcoming](#announced-not-yet-enforced) · [iPhone Duo](#iphone-duo) · [What to grep](#what-to-grep) · [How to grade](#how-to-grade-it)

## Upload blockers in force

App Store Connect refuses these builds outright — they never reach a reviewer, so they belong at the top of the report.

| Requirement | Since | Where to check |
| --- | --- | --- |
| Built with **Xcode 26+ / iOS 26 SDK** | Apr 28, 2026 | The Xcode the build actually uses: CI (`.github/workflows/*` `xcode-version`, `runs-on: macos-*`, `DEVELOPER_DIR`), `.xcode-version`, fastlane `xcodes`/`xcversion`, Bitrise/Codemagic/Xcode Cloud config, **EAS `build.*.ios.image`** (e.g. `macos-sequoia-15.5-xcode-16.4` = iOS 18 SDK → refused) |
| Deployment target **iOS 13+** (`MinimumOSVersion`; ITMS-90068) | Sep 9, 2026 | `IPHONEOS_DEPLOYMENT_TARGET` in `project.pbxproj`/xcconfigs, Podfile `platform :ios`, `Package.swift`, Expo `expo-build-properties` `ios.deploymentTarget`, Flutter `ios/Flutter/AppFrameworkInfo.plist` and `ios/Podfile`. Embedded frameworks and extensions carry their own value |
| A **launch screen** (ITMS-90870) | iOS 27 SDK builds | `UILaunchStoryboardName` / `UILaunchStoryboards` / `UILaunchScreen` / `UILaunchScreens` in Info.plist, or `INFOPLIST_KEY_UILaunchScreen_Generation` / `INFOPLIST_KEY_UILaunchStoryboardName` (TN3208) |
| Privacy manifest for required-reason APIs (ITMS-91053) and for listed third-party SDKs (ITMS-91061) | May 2024, unchanged | See the App Privacy lane |

A pinned toolchain below the SDK minimum is a **blocker** even though the code is fine: the next upload fails, and teams routinely discover it on release day.

## Announced, not yet enforced

These go in the report's *Upcoming requirements* section with their date, plus the fix — unless the user is building with the new SDK already, in which case the iOS 27 SDK items are live **now**.

| Change | When | Effect if ignored |
| --- | --- | --- |
| Builds must use the **iOS 27 SDK** and target **iOS 15+** | April 2027 | Upload refused |
| **UIScene life cycle** required for apps built with the iOS 27 SDK — "Apps built with the latest SDK must adopt the scene-based life cycle or they fail to launch" (iOS 27 release notes, TN3187) | The moment the app builds with Xcode 27 — unavoidable by April 2027 | App doesn't launch → 2.1 crash rejection |
| `UIRequiresFullScreen` no longer stops resizing for iOS 27 SDK builds; key deprecated (TN3192) | iOS 27 SDK builds | Layout breaks on resize; not a rejection by itself |
| `UIDesignRequiresCompatibility` (Liquid Glass opt-out) ignored for iOS 27 SDK builds | iOS 27 SDK builds | UI regressions |
| **iPhone Duo screenshots** required | April 2027 — Apple's news says "any apps or games submitted"; the spec page says apps "using the iOS 27.1 SDK or later". Report the broader reading and note the conflict | Submission blocked in App Store Connect |
| `ImageCreator` stops working | iOS 27 | Feature dead at runtime; use the Image Playground sheet |

Scene life cycle in practice: a SwiftUI `@main struct …: App` is scene-based already. A UIKit app needs `UIApplicationSceneManifest` with at least one configuration (or `application(_:configurationForConnecting:options:)`) and a `UIWindowSceneDelegate`; an `AppDelegate` that does `window = UIWindow(frame: UIScreen.main.bounds)` with no scene delegate is the pattern that fails. For React Native, Expo, Flutter, Capacitor and Unity, the answer depends on the framework version's native template (Capacitor 8.5 adopted UIScene; others weren't confirmed as of this snapshot) — check the generated `ios/` project if it's in the repo, and otherwise report it as a *risk*: "confirm your <framework> version's iOS template adopts UIScene before building with Xcode 27." Don't assert either way without evidence.

## iPhone Duo

The foldable iPhone (on sale Oct 23, 2026; iOS 27.1; dev support in Xcode 27.1). An outer display (~5.4") and an inner near-square display (~7.6–7.8"), six poses (closed, tent, partially folded, laptop, wide-open, tall-open), and the system moves an app between the displays as the user folds it.

**There is no App Review guideline about it.** The Oct 16, 2026 guidelines never mention a foldable, and no Apple source says App Review rejects an app for not being optimized. Don't invent a "Duo rule" or file a Duo finding under 2.4.1 (that's iPad). What exists is:

1. **SDK-dependent behaviour** (Apple, *iPhone Duo — prepare*):
   - **iOS 26 SDK or earlier:** compatibility mode — "your app will appear in the center of the display, with empty space surrounding the window" (open), and to the left of the status bar and camera when closed. An iPhone-mini-shaped app letterboxed on a $2,000 device. Allowed, but it's the experience reviewers and users see.
   - **iOS 27 SDK:** the app resizes "to fill most of the inner display".
   - **iOS 27.1 SDK or later:** "optimized for iPhone Duo", with toolbars and tab bars moving **vertical**, below the status bar — content has to adapt to that.
2. **The screenshot requirement and the badge.** "When you submit iPhone Duo screenshots in App Store Connect, your App Store product page will display a badge to let people know your app is optimized for iPhone Duo." Mandatory from April 2027 (scope conflict above). Sizes: outer 1398×2034, inner 2007×2853 (portrait). The badge is earned by **screenshots**, so screenshots that show a layout the build doesn't actually produce (mockups, stretched iPhone captures) are a 2.3.3 problem — App Review's 2.3.3 guidance says "Don't submit screenshots that misrepresent the app's actual interface" — and arguably 2.3.1(a) misleading marketing.
3. **Things that break on the device**, which matter to the 2.1 "crashes or obvious technical problems" bar once the app runs resized:
   - `UIRequiresFullScreen` — still honored on Duo for old-SDK builds, but "your app will still resize when someone opens or closes their iPhone Duo"; for iOS 27 SDK builds it no longer opts out (the system resizes the scene "discretely").
   - **Portrait lock** — the inner display delivers regular/regular size classes regardless; Apple's own statements conflict on whether the orientation lock is honored there, and "if your app supports multitasking, the system requires it to support all orientations." "All apps participate in multitasking on iPhone Duo."
   - **Geometry read once** — `UIScreen.main.bounds`, `UIWindow(frame: UIScreen.main.bounds)`, frames computed in `viewDidLoad`, React Native `Dimensions.get('window')` at module scope, fixed `width: 390`-style layouts. The display changes under the running app; layout must follow the window/scene, not the screen.
   - **Idiom/size-class confusion** — `userInterfaceIdiom == .pad` to choose layouts, or `horizontalSizeClass == .regular` treated as "iPad". Apple: "Don't treat 'regular width' as 'iPad'" and "Don't choose a layout by idiom."
   - **State lost on fold** — treat display transitions "as size-class and trait changes, not a scene disconnect"; state that must survive a disconnect goes through `stateRestorationActivity(for:)`.
   - **Custom bars** — hand-built `UITabBar`/`UIToolbar`/`UINavigationBar` frames that assume a horizontal bar at the bottom/top.
   - **Camera** — the front camera is a virtual device that follows the active display; mirroring decided from `position` and missing `AVCaptureDeviceRotationCoordinator` produce wrong previews.

`TARGETED_DEVICE_FAMILY = 1` (iPhone-only) is **fine** — Duo is an iPhone and "support for iPad is not required." Don't flag it as a Duo problem; 2.4.1's "iPhone apps should run on iPad whenever possible" is a separate, soft encouragement.

## What to grep

Framework-specific locations of these keys are in `repo-probes.md`.

```
# toolchain & targets
xcode-version|DEVELOPER_DIR|xcversion|xcodes|"image":|IPHONEOS_DEPLOYMENT_TARGET|platform :ios|deploymentTarget|MinimumOSVersion
# launch screen & life cycle
UILaunchStoryboardName|UILaunchScreen|UIApplicationSceneManifest|UISceneDelegateClassName|configurationForConnecting|UIWindowSceneDelegate|@main
# resizing opt-outs & orientation
UIRequiresFullScreen|requireFullScreen|UIRequiresFullScreenIgnoredStartingWithVersion|UIDesignRequiresCompatibility|UISupportedInterfaceOrientations|"orientation":|supportedInterfaceOrientations|TARGETED_DEVICE_FAMILY|supportsTablet
# geometry read once / idiom
UIScreen\.main|UIWindow\(frame:|statusBarOrientation|UIDevice\.current\.orientation|interfaceOrientation|userInterfaceIdiom|horizontalSizeClass == \.regular|Dimensions\.get\(|MediaQuery\.of\(context\)\.size|Screen\.width
# deprecated in iOS 27
ImageCreator
# Duo adoption signals (positive evidence — mention, don't flag)
onHingeChange|UIHingeInteraction|reservedRegions|toolbarVerticalEdge|verticalBarEdge|ArrangementView|UIWindowSceneActivationAction|AVCaptureDeviceRotationCoordinator
```

Also check `fastlane/Snapfile` / `fastlane/screenshots/` / `fastlane/metadata/` for whether a Duo screenshot set is planned, and the toolchain version against **Xcode 27.1** (the first with Duo support and the iOS 27.1 SDK). Xcode 27.1 "requires a Mac running macOS Tahoe 26.6 or later" (Xcode 27.1 release notes), so a CI job on a `macos-15` / `macos-14` runner image — or a pinned EAS/Bitrise/Codemagic image on Sequoia — can't build the Duo-optimized version at all: moving to it is a runner change, not just an Xcode bump. Say so whenever you recommend Xcode 27.x.

## How to grade it

- **blocker** — the build will be refused at upload today (SDK/Xcode below minimum, deployment target below iOS 13, no launch screen on an iOS 27 SDK build), or the project already builds with the iOS 27 SDK and has no scene life cycle (won't launch).
- **risk** — no scene life cycle while still on the iOS 26 SDK (blocker the day Xcode 27 is adopted, and in April 2027 regardless); `UIRequiresFullScreen`/portrait lock plus geometry-read-once code (visible breakage when folded/unfolded); screenshots in the repo that would misrepresent the Duo layout.
- **upcoming** (report section, not a finding) — April 2027 SDK / iOS 15 target / Duo screenshots, with the date and the conflict note.
- **nit** — Duo compatibility mode on an otherwise-correct app (letterboxed but working); missing Duo adoption that only costs the badge.

Always say plainly when a Duo item is *quality and deadline* exposure rather than a current rejection — the user asking "will Apple reject us because of the iPhone Duo?" deserves a straight answer: not today, here is what changes and when.
