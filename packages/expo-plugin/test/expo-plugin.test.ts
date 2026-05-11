import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { defineAppIntentsConfig, generateAppIntents } from "react-native-app-intents/codegen";

import {
  applyEntitlementsAppIntentsConfig,
  applyInfoPlistAppIntentsConfig,
  patchSwiftAppDelegate,
  withAppIntents,
} from "../src/index.js";

test("withAppIntents appends a plugin tuple", () => {
  const config = withAppIntents(
    { name: "example-app" },
    { intents: ["src/**/*.intents.ts"], scheme: "example" },
  );

  assert.deepEqual(config.plugins, [
    ["react-native-app-intents", { intents: ["src/**/*.intents.ts"], scheme: "example" }],
  ]);
});

test("patchSwiftAppDelegate injects quick action forwarding idempotently", () => {
  const source = [
    "import Expo",
    "import UIKit",
    "",
    "@UIApplicationMain",
    "class AppDelegate: ExpoAppDelegate {",
    "  func application(",
    "    _ application: UIApplication,",
    "    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil",
    "  ) -> Bool {",
    "    return super.application(application, didFinishLaunchingWithOptions: launchOptions)",
    "  }",
    "}",
    "",
  ].join("\n");

  const patched = patchSwiftAppDelegate(source);

  assert.match(patched, /import ReactNativeAppIntents/);
  assert.match(patched, /launchOptions\?\[\.shortcutItem\] as\? UIApplicationShortcutItem/);
  assert.match(patched, /performActionFor shortcutItem: UIApplicationShortcutItem/);
  assert.equal(patchSwiftAppDelegate(patched), patched);
});

test("Expo config helpers patch Info.plist and entitlements", () => {
  const options = defineAppIntentsConfig({
    intents: ["src/**/*.intents.ts"],
    scheme: "expoexample",
    ios: {
      output: "ios/AppIntents/GeneratedAppIntents.swift",
      appGroupIdentifier: "group.dev.expo.example",
      siriUsageDescription: "Used to let Siri run app actions.",
    },
  });

  const infoPlist = applyInfoPlistAppIntentsConfig({}, options);
  const entitlements = applyEntitlementsAppIntentsConfig({}, options);

  assert.deepEqual(infoPlist.CFBundleURLTypes, [
    {
      CFBundleURLSchemes: ["expoexample"],
    },
  ]);
  assert.equal(infoPlist.ReactNativeAppIntentsAppGroupIdentifier, "group.dev.expo.example");
  assert.equal(infoPlist.NSSiriUsageDescription, "Used to let Siri run app actions.");
  assert.deepEqual(entitlements["com.apple.security.application-groups"], [
    "group.dev.expo.example",
  ]);
});

test("expo plugin config drives codegen on expo-style paths", async () => {
  const repoRoot = resolve(import.meta.dirname, "../../..");
  const cwd = await mkdtemp(join(repoRoot, ".tmp-expo-"));

  try {
    await mkdir(join(cwd, "src"), { recursive: true });
    await mkdir(join(cwd, "android/app/src/main"), { recursive: true });
    await writeFile(
      join(cwd, "src/orders.intents.ts"),
      [
        'import { defineIntent, p } from "react-native-app-intents";',
        "",
        "export const openOrder = defineIntent({",
        '  id: "openOrder",',
        '  title: "Open Order",',
        '  phrases: ["Open order ${orderNumber} in ${.applicationName}"],',
        "  params: {",
        '    orderNumber: p.string({ default: "1234" }),',
        "  },",
        "  surfaces: {",
        "    appShortcut: true,",
        "  },",
        "});",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(cwd, "android/app/src/main/AndroidManifest.xml"),
      [
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
        "  <application>",
        '    <activity android:name=".MainActivity">',
        "    </activity>",
        "  </application>",
        "</manifest>",
        "",
      ].join("\n"),
      "utf8",
    );

    const config = withAppIntents(
      { name: "expo-app" },
      {
        intents: ["src/**/*.intents.ts"],
        scheme: "expoexample",
        ios: { output: "ios/Generated/ExpoAppIntents.swift" },
        android: {
          manifest: "android/app/src/main/AndroidManifest.xml",
          packageName: "dev.expo.example",
          shortcutsOutput: "android/app/src/main/res/xml/expo_shortcuts.xml",
        },
        types: { output: "src/generated/app-intents.d.ts" },
      },
    );
    const pluginEntry = config.plugins?.[0];

    assert.ok(Array.isArray(pluginEntry));

    const result = await generateAppIntents(
      defineAppIntentsConfig(pluginEntry?.[1] as Parameters<typeof defineAppIntentsConfig>[0]),
      { cwd },
    );

    await access(join(cwd, "ios/Generated/ExpoAppIntents.swift"));
    await access(join(cwd, "android/app/src/main/res/values/expo_shortcuts_strings.xml"));
    const generatedTypes = await readFile(join(cwd, "src/generated/app-intents.d.ts"), "utf8");

    assert.equal(result.artifacts.length, 4);
    assert.match(generatedTypes, /GeneratedAppIntentEvent/);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});
