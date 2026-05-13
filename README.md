# react-native-app-intents

Type-safe App Intents, App Shortcuts, and dynamic shortcut helpers for React Native.

```bash
npm install @crockalet/react-native-app-intents
```

Full usage docs are set up for GitHub Pages at:
`https://crockalet.github.io/react-native-app-intents/`

## Basic setup

Create `app-intents.config.ts`:

```ts
import { defineAppIntentsConfig } from "@crockalet/react-native-app-intents/codegen";

export default defineAppIntentsConfig({
  intents: ["src/**/*.intents.ts"],
  scheme: "myapp",
  ios: {
    output: "ios/MyApp/AppShortcuts.swift",
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

Define intents:

```ts
import { defineIntent, p } from "@crockalet/react-native-app-intents";

export const openOrder = defineIntent({
  id: "openOrder",
  title: "Open Order",
  phrases: ["Open order ${orderNumber} in ${.applicationName}"],
  params: {
    orderNumber: p.string({ title: "Order number", default: "1234" }),
  },
  surfaces: {
    siri: true,
    spotlight: true,
    appShortcut: {
      icon: {
        androidResourceName: "@mipmap/ic_launcher_round",
        systemName: "shippingbox",
      },
    },
    assistant: true,
  },
  androidBii: "actions.intent.GET_ORDER",
});
```

Generate native files:

```bash
npx app-intents generate
```

Handle intents in JS:

```ts
import { createAppIntentsRuntime } from "@crockalet/react-native-app-intents";
import { openOrder } from "./orders.intents";

const appIntents = createAppIntentsRuntime({
  scheme: "myapp",
  intents: [openOrder] as const,
});

appIntents.onIntent(openOrder, (params) => {
  // Navigate to the requested order.
});
```

For auth-gated apps, donate only after a real user action, and clear donations
plus dynamic shortcuts on logout or when the feature is disabled:

```ts
import { useEffect } from "react";

async function handleOpenedOrder(orderNumber: string) {
  await appIntents.donate(openOrder, { orderNumber });
}

useEffect(() => {
  if (!session || !flags.orderShortcuts) {
    void appIntents.clearDonations();
    void appIntents.updateDynamicShortcuts([]);
    return;
  }

  void appIntents.updateDynamicShortcuts([
    {
      icon: {
        androidResourceName: "@mipmap/ic_launcher_round",
        systemName: "shippingbox",
      },
      intent: openOrder,
      params: { orderNumber: session.lastViewedOrderNumber },
      shortTitle: "Open last order",
      longTitle: `Open order ${session.lastViewedOrderNumber}`,
    },
  ]);
}, [session, flags.orderShortcuts]);

async function logout() {
  await auth.signOut();
  await appIntents.clearDonations();
  await appIntents.updateDynamicShortcuts([]);
}
```

`surfaces.appShortcut` still accepts `true`, but you can also pass an object to set
an iOS SF Symbol (`systemName`) and/or an Android shortcut resource reference
(`androidResourceName`, such as `@mipmap/ic_launcher_round`).

## Expo setup

Use the package root as an Expo config plugin. The plugin reads the same
`app-intents.config.ts` file used by the CLI, so `app.config.ts` does not need to
duplicate your intent configuration:

```json
{
  "expo": {
    "plugins": ["@crockalet/react-native-app-intents"]
  }
}
```

To use a different config file, pass `configPath`:

```json
{
  "expo": {
    "plugins": [
      ["@crockalet/react-native-app-intents", { "configPath": "./config/app-intents.ts" }]
    ]
  }
}
```

In Expo prebuilds, configured `ios.output`, `android.manifest`,
`android.shortcutsOutput`, and `android.shortcutsStringsOutput` paths are honored
relative to the app root. If `ios.output` does not start with `ios/`, it is
written under the generated iOS project folder.

### Custom shortcut icons with `expo-asset`

For custom **Android** shortcut icons in Expo apps, add the image files to native
resources with the `expo-asset` config plugin, then reference the generated
resource name from `androidResourceName`:

```json
{
  "expo": {
    "plugins": [
      ["expo-asset", { "assets": ["./assets/shortcuts/open_order.png"] }],
      "@crockalet/react-native-app-intents"
    ]
  }
}
```

```ts
surfaces: {
  appShortcut: {
    icon: {
      androidResourceName: "@drawable/open_order",
      systemName: "shippingbox",
    },
  },
}
```

For iOS **dynamic shortcuts**, you can also point at a bundled template image
name from the same asset file:

```ts
await appIntents.updateDynamicShortcuts([
  {
    icon: {
      androidResourceName: "@drawable/open_order",
      iosTemplateImageName: "open_order",
      systemName: "shippingbox",
    },
    intent: openOrder,
    params: { orderNumber: "1234" },
    shortTitle: "Open order #1234",
  },
]);
```

`expo-asset` uses the file name as the native resource name, so keep shortcut
asset files lowercase with underscores (for example, `open_order.png`). Run
`npx expo prebuild` again after adding or renaming assets.

On iOS, `iosTemplateImageName` only applies to **dynamic shortcuts** and renders
as a template/tinted silhouette. Generated App Shortcuts still use `systemName`
only; Expo-bundled PNG assets are not used there.

## Current features

- Single scoped npm package: runtime, authoring API, codegen, CLI, and Expo plugin.
- Type-safe `defineIntent`, `defineEntity`, and `p.*` parameter builders.
- iOS Swift App Intents/App Shortcuts generation.
- Android shortcuts XML, strings XML, and manifest patching.
- Generated TypeScript event types.
- Runtime helpers for initial intents, warm intent events, intent URL parsing/building, donations,
  donation clearing, and dynamic shortcuts.
- Expo prebuild plugin for iOS codegen, URL scheme setup, app group entitlements, and quick-action forwarding.
- Bare React Native iOS and Android native modules.

## Planned features

- Better Android Assistant/App Actions coverage.
- Richer icons and metadata for generated shortcuts.
- More Expo and bare-app setup automation.
- Expanded examples and end-to-end app templates.
- More generated type helpers for navigation integrations.

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run test
bun run build
```

The repository is a Bun workspace. `packages/react-native` is the public
`@crockalet/react-native-app-intents` package; the other workspace packages are private internal boundaries.
