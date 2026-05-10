import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { defineAppIntentsConfig, generateAppIntents } from "../src/index.js";

test("generateAppIntents writes bare RN artifacts from intent definitions", async () => {
  const repoRoot = resolve(import.meta.dirname, "../../..");
  const cwd = await mkdtemp(join(repoRoot, ".tmp-codegen-"));
  const config = defineAppIntentsConfig({
    intents: ["src/**/*.intents.ts"],
    scheme: "example",
    ios: { output: "ios/AppIntents/GeneratedAppIntents.swift" },
    android: {
      manifest: "android/app/src/main/AndroidManifest.xml",
      packageName: "com.crockalet.appintents.example",
      shortcutsOutput: "android/app/src/main/res/xml/app_intents_shortcuts.xml",
    },
    types: { output: "src/generated/app-intents.d.ts" },
  });

  try {
    await mkdir(join(cwd, "src"), { recursive: true });
    await mkdir(join(cwd, "android/app/src/main"), { recursive: true });
    await writeFile(
      join(cwd, "src/orders.intents.ts"),
      [
        'import { defineIntent, p } from "@react-native-app-intents/core";',
        "",
        "export const openOrder = defineIntent({",
        '  id: "openOrder",',
        '  title: "Open Order",',
        '  description: "Open a specific order.",',
        '  phrases: ["Open order ${orderNumber} in ${.applicationName}", "Show my order ${orderNumber}"],',
        "  params: {",
        '    orderNumber: p.string({ default: "1234", title: "Order Number" }),',
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

    const result = await generateAppIntents(config, { cwd });
    const generatedSwift = await readFile(
      join(cwd, "ios/AppIntents/GeneratedAppIntents.swift"),
      "utf8",
    );
    const generatedShortcuts = await readFile(
      join(cwd, "android/app/src/main/res/xml/app_intents_shortcuts.xml"),
      "utf8",
    );
    const generatedShortcutStrings = await readFile(
      join(cwd, "android/app/src/main/res/values/app_intents_shortcuts_strings.xml"),
      "utf8",
    );
    const generatedTypes = await readFile(join(cwd, "src/generated/app-intents.d.ts"), "utf8");
    const generatedManifest = await readFile(
      join(cwd, "android/app/src/main/AndroidManifest.xml"),
      "utf8",
    );

    assert.equal(result.artifacts.length, 4);
    assert.match(generatedSwift, /struct OpenOrderIntent: AppIntent/);
    assert.match(generatedSwift, /struct GeneratedAppShortcuts: AppShortcutsProvider/);
    assert.match(generatedSwift, /enqueueReactNativeAppIntentURL/);
    assert.match(generatedShortcuts, /android:shortcutId="openOrder"/);
    assert.match(
      generatedShortcuts,
      /android:shortcutShortLabel="@string\/react_native_app_intents_open_order_short_label"/,
    );
    assert.match(generatedShortcuts, /example:\/\/app-intents\/openOrder\?payload=/);
    assert.match(
      generatedShortcutStrings,
      /<string name="react_native_app_intents_open_order_short_label">Open Order<\/string>/,
    );
    assert.match(generatedTypes, /GeneratedAppIntentEvent/);
    assert.match(generatedManifest, /android\.app\.shortcuts/);
    assert.match(generatedManifest, /android:scheme="example"/);

    const checkResult = await generateAppIntents(config, { check: true, cwd });

    assert.equal(checkResult.message, "Generated artifacts are up to date.");
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});
