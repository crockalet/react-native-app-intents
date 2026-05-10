import { defineAppIntentsConfig } from "@react-native-app-intents/codegen";

export default defineAppIntentsConfig({
  intents: ["src/**/*.intents.ts"],
  scheme: "example",
  ios: {
    output: "../apps/example-bare/ios/AppIntentsBareExample/AppShortcuts.swift",
    appGroupIdentifier: "group.com.crockalet.appintents.example",
    appShortcutsProviderName: "ExampleAppShortcuts",
    bundleIdentifier: "com.crockalet.appintents.example",
    siriUsageDescription: "Used to let Siri run example app actions.",
  },
  android: {
    manifest: "../apps/example-bare/android/app/src/main/AndroidManifest.xml",
    shortcutsOutput: "../apps/example-bare/android/app/src/main/res/xml/app_shortcuts.xml",
    packageName: "com.crockalet.appintents.example",
  },
  types: { output: "src/generated/app-intents.d.ts" },
});
