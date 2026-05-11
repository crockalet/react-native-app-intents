---
layout: default
title: react-native-app-intents
---

# react-native-app-intents

`react-native-app-intents` helps React Native apps define type-safe intents once, generate native
App Intents/App Shortcuts files, and route launched intents back into JavaScript.

## Install

```bash
npm install react-native-app-intents
```

For iOS bare React Native apps, install pods after adding the package:

```bash
npx pod-install
```

## Define intents

Create intent files anywhere matched by your config, for example `src/orders.intents.ts`:

```ts
import { defineEntity, defineIntent, p } from "react-native-app-intents";

export const Order = defineEntity({
  id: "Order",
  title: "Order",
  inventory: [{ id: 1, number: "1234", customer: "Taylor" }],
  schema: p.object({
    id: p.int(),
    number: p.string(),
    customer: p.string(),
  }),
  identifier: (order) => String(order.id),
  displayRepresentation: (order) => ({
    title: `Order #${order.number}`,
    subtitle: order.customer,
    image: { systemName: "bag" },
  }),
});

export const openOrder = defineIntent({
  id: "openOrder",
  title: "Open Order",
  description: "Open a specific order.",
  phrases: ["Open order ${orderNumber} in ${.applicationName}"],
  params: {
    orderNumber: p.string({
      title: "Order number",
      default: "1234",
      requestValueDialog: "What's the order number?",
    }),
  },
  surfaces: {
    siri: true,
    spotlight: true,
    appShortcut: true,
    assistant: true,
  },
  androidBii: "actions.intent.GET_ORDER",
  behavior: { opensAppToForeground: true },
});

export const openSavedOrder = defineIntent({
  id: "openSavedOrder",
  title: "Open Saved Order",
  phrases: ["Open ${order} in ${.applicationName}"],
  params: {
    order: p.entity(Order, {
      title: "Order",
      default: { id: 1, number: "1234", customer: "Taylor" },
    }),
  },
  surfaces: {
    siri: true,
    spotlight: true,
    appShortcut: true,
    assistant: true,
  },
  androidBii: "actions.intent.GET_ORDER",
});
```

## Configure codegen

Create `app-intents.config.ts` at your app root:

```ts
import { defineAppIntentsConfig } from "react-native-app-intents/codegen";

export default defineAppIntentsConfig({
  intents: ["src/**/*.intents.ts"],
  scheme: "myapp",
  ios: {
    output: "ios/MyApp/AppShortcuts.swift",
    appGroupIdentifier: "group.com.example.myapp",
    appShortcutsProviderName: "MyAppShortcuts",
    bundleIdentifier: "com.example.myapp",
    siriUsageDescription: "Used to let Siri run app actions.",
  },
  android: {
    manifest: "android/app/src/main/AndroidManifest.xml",
    shortcutsOutput: "android/app/src/main/res/xml/app_shortcuts.xml",
    packageName: "com.example.myapp",
  },
  types: { output: "src/generated/app-intents.d.ts" },
});
```

Run codegen:

```bash
npx app-intents generate
```

Use `--check` in CI to fail when generated files are stale:

```bash
npx app-intents generate --check
```

## Expo setup

Add the package as an Expo config plugin:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-app-intents",
        {
          "intents": ["src/**/*.intents.ts"],
          "scheme": "myapp",
          "ios": {
            "appGroupIdentifier": "group.com.example.myapp",
            "siriUsageDescription": "Used to let Siri run app actions."
          }
        }
      ]
    ]
  }
}
```

Then run prebuild:

```bash
npx expo prebuild
```

The plugin currently:

- runs codegen with Expo-derived native paths
- patches `Info.plist` for the URL scheme and optional Siri/app-group settings
- patches entitlements when `ios.appGroupIdentifier` is configured
- injects iOS home-screen quick-action forwarding into `AppDelegate.swift`
- adds the generated Swift source file to the Xcode project

## Bare React Native setup

Codegen handles the generated Swift and Android XML files, but bare iOS apps still need to forward
home-screen quick actions from `AppDelegate.swift`:

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

Android deep links are routed through the generated manifest intent filters and the native module's
pending URL queue.

## Handle intents at runtime

```ts
import { createAppIntentsRuntime } from "react-native-app-intents";
import { openOrder, openSavedOrder } from "./orders.intents";

const appIntents = createAppIntentsRuntime({
  scheme: "myapp",
  intents: [openOrder, openSavedOrder] as const,
});

const initialIntent = await appIntents.getInitialIntent();

if (initialIntent?.id === "openOrder") {
  // Navigate from a cold launch.
}

const unsubscribe = appIntents.onIntent(openOrder, (params) => {
  // Navigate from a warm/background launch.
});
```

## Dynamic shortcuts

```ts
await appIntents.updateDynamicShortcuts([
  {
    intent: openOrder,
    params: { orderNumber: "1234" },
    shortTitle: "Open order #1234",
    longTitle: "Taylor",
  },
]);
```

## Donations

```ts
await appIntents.donate(openOrder, { orderNumber: "1234" });
```

On iOS this creates an `NSUserActivity`; on Android it reports shortcut usage through
`ShortcutManagerCompat`.

## Current features

- Single npm package containing the runtime, authoring API, codegen, CLI, and Expo plugin.
- Type-safe authoring with `defineIntent`, `defineEntity`, and `p.*` parameter builders.
- Swift App Intents/App Shortcuts generation for iOS.
- Android shortcuts XML, strings XML, and manifest patching.
- Generated TypeScript event types.
- Initial intent and warm intent event handling in JavaScript.
- Dynamic home-screen shortcuts on iOS and Android.
- Intent donation helpers.
- Expo prebuild plugin and bare React Native native modules.

## Planned features

- Better Android Assistant/App Actions coverage.
- Richer shortcut icons and metadata.
- More setup automation for bare apps.
- Navigation integration examples.
- Expanded example apps and end-to-end templates.

## Publishing these docs with GitHub Pages

This repository includes a GitHub Actions workflow that builds this `docs/` directory with GitHub
Pages. In the GitHub repository settings, set **Pages -> Build and deployment -> Source** to
**GitHub Actions**. Push to `main`, then open:

```text
https://crockalet.github.io/react-native-app-intents/
```
