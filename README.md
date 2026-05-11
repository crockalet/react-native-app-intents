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
  surfaces: { siri: true, spotlight: true, appShortcut: true, assistant: true },
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

## Expo setup

Use the package as an Expo config plugin:

```json
{
  "expo": {
    "plugins": ["@crockalet/react-native-app-intents"]
  }
}
```

## Current features

- Single scoped npm package: runtime, authoring API, codegen, CLI, and Expo plugin.
- Type-safe `defineIntent`, `defineEntity`, and `p.*` parameter builders.
- iOS Swift App Intents/App Shortcuts generation.
- Android shortcuts XML, strings XML, and manifest patching.
- Generated TypeScript event types.
- Runtime helpers for initial intents, warm intent events, intent URL parsing/building, donations, and dynamic shortcuts.
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
