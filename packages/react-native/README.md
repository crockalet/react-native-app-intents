# react-native-app-intents

Type-safe App Intents, App Shortcuts, dynamic shortcut helpers, codegen, CLI, and Expo prebuild automation for React Native.

```bash
npm install @crockalet/react-native-app-intents
```

Full usage docs are included in this package under `docs/` and published at:
`https://crockalet.github.io/react-native-app-intents/`

## Basic setup

Create `app-intents.config.ts` at your app root:

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
  surfaces: { siri: true, spotlight: true, appShortcut: true, assistant: true },
});
```

Generate native files:

```bash
npx app-intents generate
```

## Expo setup

Use the package root as an Expo config plugin. The plugin auto-loads the same
`app-intents.config.ts` file used by the CLI:

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

## Runtime usage

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
