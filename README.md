# react-native-app-intents

Initial M0 scaffold for a Bun workspaces monorepo that will house the core authoring API, codegen, CLI, React Native runtime, Expo plugin, and an example app package.

## Workspace layout

```text
packages/
  core/
  codegen/
  cli/
  react-native/
  expo-plugin/
example/
```

## Commands

```bash
bun install
bun run typecheck
bun run lint
bun run test
bun run build
```

The current code establishes the package boundaries and shared tooling so the implementation milestones in `plan.md` can land incrementally.

## iOS home-screen quick actions

On iOS, the items shown when a user **long-presses your app icon on the home screen** are
`UIApplicationShortcutItem` quick actions.

If you create those items through `exampleRuntime.updateDynamicShortcuts(...)` (or the equivalent
runtime API in your app), iOS will not route them through the AppIntent handoff automatically. Your
app delegate must forward the selected shortcut's URL into `ReactNativeAppIntents` for both:

- **cold launch** via `launchOptions[.shortcutItem]`
- **warm/background launch** via `application(_:performActionFor:completionHandler:)`

Bare React Native apps should wire it like this:

```swift
func application(
  _ application: UIApplication,
  didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
) -> Bool {
  // ... existing startup ...

  if let shortcutItem = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem,
     handleShortcutItem(shortcutItem) {
    return false
  }

  return true
}

func application(
  _ application: UIApplication,
  performActionFor shortcutItem: UIApplicationShortcutItem,
  completionHandler: @escaping (Bool) -> Void
) {
  completionHandler(handleShortcutItem(shortcutItem))
}

private func handleShortcutItem(_ shortcutItem: UIApplicationShortcutItem) -> Bool {
  guard let url = shortcutItem.userInfo?["url"] as? String else {
    return false
  }

  ReactNativeAppIntents.recordIncomingURLString(url)
  return true
}
```

Without that forwarding, a cold launch from the home-screen quick-action menu can open the app
without populating the initial intent in JS.

## iOS AppIntent-generated shortcuts

The Swift code generated for iOS AppIntents uses a pending-URL handoff for true AppIntent surfaces
such as Siri and App Shortcuts. When your app uses an App Group, prefer setting
`ios.appGroupIdentifier` in `app-intents.config.ts` so the generated Swift can write to an explicit
shared `UserDefaults` suite instead of relying on `Bundle.main` lookup during AppIntent execution.

## Expo note

The Expo plugin now does the native iOS wiring during prebuild:

- runs codegen with Expo-derived native paths
- patches `Info.plist` for the URL scheme and optional Siri/app-group settings
- patches entitlements when `ios.appGroupIdentifier` is configured
- injects `UIApplicationShortcutItem` forwarding into `AppDelegate.swift`
- adds the generated Swift source file to the Xcode project

That means Expo apps using `updateDynamicShortcuts(...)` no longer need to hand-edit
`AppDelegate.swift` after prebuild for this quick-action path.
