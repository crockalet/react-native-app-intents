import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  normalizeIntentDefinitions,
  resolveLocalizedText,
  type AnyParameterDefinition,
  type IntentDefinition,
  type NormalizedIntentMetadata,
} from "@react-native-app-intents/core";

import type { AppIntentsConfig } from "./config.js";

export interface GeneratedArtifact {
  platform: "ios" | "android" | "types";
  path: string;
}

export interface GenerateAppIntentsOptions {
  cwd?: string;
  check?: boolean;
}

export interface GenerateAppIntentsResult {
  artifacts: GeneratedArtifact[];
  changed: boolean;
  message: string;
}

interface LoadedIntentSource {
  absolutePath: string;
  exportName: string;
  importKind: "default" | "named";
  intent: IntentDefinition<any>;
}

interface RenderedArtifacts {
  androidManifest?: string;
  artifacts: Array<GeneratedArtifact & { content: string }>;
}

interface AndroidShortcutArtifact {
  id: string;
  longLabel: string;
  shortLabel: string;
  shortLabelResourceName: string;
  longLabelResourceName: string;
  url: string;
}

const IOS_PENDING_URLS_DEFAULTS_KEY = "ReactNativeAppIntentsPendingURLs";

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern: string): RegExp {
  let expression = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    const nextCharacter = pattern[index + 1];

    if (character === "*" && nextCharacter === "*") {
      const slashAfterGlobstar = pattern[index + 2] === "/";

      expression += slashAfterGlobstar ? "(?:.*/)?" : ".*";
      index += slashAfterGlobstar ? 2 : 1;
      continue;
    }

    if (character === "*") {
      expression += "[^/]*";
      continue;
    }

    if (character === "?") {
      expression += "[^/]";
      continue;
    }

    expression += escapeRegExp(character);
  }

  expression += "$";

  return new RegExp(expression);
}

async function walkFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }

    const absolutePath = resolve(current, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function resolveIntentModulePaths(
  patterns: readonly string[],
  cwd: string,
): Promise<string[]> {
  const allFiles = await walkFiles(cwd);
  const matches = new Set<string>();

  for (const pattern of patterns) {
    const matcher = globToRegExp(pattern.replaceAll("\\", "/"));

    for (const file of allFiles) {
      const relativePath = relative(cwd, file).replaceAll("\\", "/");

      if (matcher.test(relativePath)) {
        matches.add(file);
      }
    }
  }

  return [...matches].sort();
}

function isIntentDefinition(value: unknown): value is IntentDefinition<any> {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "intent" &&
    "id" in value &&
    typeof value.id === "string"
  );
}

async function loadIntentSources(
  patterns: readonly string[],
  cwd: string,
): Promise<LoadedIntentSource[]> {
  const modulePaths = await resolveIntentModulePaths(patterns, cwd);
  const loaded: LoadedIntentSource[] = [];

  for (const modulePath of modulePaths) {
    const moduleUrl = pathToFileURL(modulePath).href;
    const moduleExports = await import(moduleUrl);

    for (const [exportName, value] of Object.entries(moduleExports)) {
      if (!isIntentDefinition(value)) {
        continue;
      }

      loaded.push({
        absolutePath: modulePath,
        exportName,
        importKind: exportName === "default" ? "default" : "named",
        intent: value,
      });
    }
  }

  if (loaded.length === 0) {
    throw new Error("No intent definitions were found for the configured patterns.");
  }

  return loaded;
}

function toPascalCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("");
}

function escapeSwiftString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function serializeParameterDefault(definition: AnyParameterDefinition, value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  switch (definition.kind) {
    case "date":
      return value instanceof Date ? value.toISOString() : value;
    case "object": {
      if (typeof value !== "object" || value === null) {
        return value;
      }

      const serialized: Record<string, unknown> = {};

      for (const [fieldName, fieldDefinition] of Object.entries(definition.fields)) {
        serialized[fieldName] = serializeParameterDefault(
          fieldDefinition,
          (value as Record<string, unknown>)[fieldName],
        );
      }

      return serialized;
    }
    default:
      return value;
  }
}

function buildDefaultParams(intent: NormalizedIntentMetadata): Record<string, unknown> | null {
  const params: Record<string, unknown> = {};

  for (const [paramName, definition] of Object.entries(intent.intent.params) as [
    string,
    AnyParameterDefinition,
  ][]) {
    if (!("default" in definition) || definition.default === undefined) {
      return null;
    }

    params[paramName] = serializeParameterDefault(definition, definition.default);
  }

  return params;
}

function buildIntentUrl(scheme: string, intentId: string, params: Record<string, unknown>): string {
  return `${scheme}://app-intents/${encodeURIComponent(intentId)}?payload=${encodeURIComponent(
    JSON.stringify(params),
  )}`;
}

function toSwiftAppShortcutPhrase(phrase: string): string {
  const sentinel = "__APP_NAME_PLACEHOLDER__";

  return escapeSwiftString(phrase.replaceAll("${.applicationName}", sentinel)).replaceAll(
    sentinel,
    "\\(.applicationName)",
  );
}

function toAndroidResourceName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase();
}

function getAndroidShortcutArtifact(
  intent: NormalizedIntentMetadata,
  scheme: string,
): AndroidShortcutArtifact | null {
  const defaultParams = buildDefaultParams(intent);

  if (!defaultParams) {
    return null;
  }

  const resourceBaseName = toAndroidResourceName(intent.id);

  return {
    id: intent.id,
    longLabel: intent.description ?? intent.title,
    longLabelResourceName: `react_native_app_intents_${resourceBaseName}_long_label`,
    shortLabel: intent.title,
    shortLabelResourceName: `react_native_app_intents_${resourceBaseName}_short_label`,
    url: buildIntentUrl(scheme, intent.id, defaultParams),
  };
}

function getAndroidShortcutArtifacts(
  intentMetadata: readonly NormalizedIntentMetadata[],
  scheme: string,
): AndroidShortcutArtifact[] {
  const artifacts: AndroidShortcutArtifact[] = [];

  for (const intent of intentMetadata) {
    if (!intent.surfaces.appShortcut) {
      continue;
    }

    const artifact = getAndroidShortcutArtifact(intent, scheme);

    if (artifact) {
      artifacts.push(artifact);
    }
  }

  return artifacts;
}

function getSwiftType(definition: AnyParameterDefinition): string {
  switch (definition.kind) {
    case "string":
      return "String";
    case "int":
      return "Int";
    case "number":
      return "Double";
    case "bool":
      return "Bool";
    case "date":
      return "Date";
    case "object":
    case "entity":
      throw new Error(
        `iOS codegen does not yet support "${definition.kind}" App Intent parameters.`,
      );
  }
}

function renderSwiftParameter(name: string, definition: AnyParameterDefinition): string {
  const lines = [
    `  @Parameter(`,
    `    title: "${escapeSwiftString(resolveLocalizedText(definition.title, name) ?? name)}",`,
  ];
  const requestValueDialog = resolveLocalizedText(definition.requestValueDialog);

  if (requestValueDialog) {
    lines.push(`    requestValueDialog: IntentDialog("${escapeSwiftString(requestValueDialog)}")`);
  }

  lines.push("  )");
  lines.push(`  var ${name}: ${getSwiftType(definition)}`);

  return lines.join("\n");
}

function renderSwift(
  intentMetadata: readonly NormalizedIntentMetadata[],
  scheme: string,
  providerName: string,
): string {
  const declarations: string[] = [
    "import AppIntents",
    "import Foundation",
    "",
    `private let reactNativeAppIntentsPendingURLsKey = "${IOS_PENDING_URLS_DEFAULTS_KEY}"`,
    "",
    "private func enqueueReactNativeAppIntentURL(_ url: URL) {",
    "  let defaults = UserDefaults.standard",
    "  var pendingUrls = defaults.stringArray(forKey: reactNativeAppIntentsPendingURLsKey) ?? []",
    "  pendingUrls.append(url.absoluteString)",
    "  defaults.set(pendingUrls, forKey: reactNativeAppIntentsPendingURLsKey)",
    "}",
    "",
  ];

  for (const intent of intentMetadata) {
    const typeName = `${toPascalCase(intent.id)}Intent`;
    const payloadTypeName = `${toPascalCase(intent.id)}Payload`;
    const payloadFields = (
      Object.entries(intent.intent.params) as [string, AnyParameterDefinition][]
    ).map(([name, definition]) => `  let ${name}: ${getSwiftType(definition)}`);
    const parameters = (
      Object.entries(intent.intent.params) as [string, AnyParameterDefinition][]
    ).map(([name, definition]) => renderSwiftParameter(name, definition));
    const queryItems =
      Object.keys(intent.intent.params).length === 0
        ? "[]"
        : ["[", '      URLQueryItem(name: "payload", value: payloadString),', "    ]"].join("\n");
    const payloadArguments =
      Object.keys(intent.intent.params).length === 0
        ? ""
        : Object.keys(intent.intent.params)
            .map((paramName) => `${paramName}: ${paramName}`)
            .join(", ");

    declarations.push(
      "@available(iOS 16.0, *)",
      `private struct ${payloadTypeName}: Encodable {`,
      ...(payloadFields.length === 0 ? ["  init() {}"] : payloadFields),
      "}",
      "",
      "@available(iOS 16.0, *)",
      `struct ${typeName}: AppIntent {`,
      `  static let title: LocalizedStringResource = "${escapeSwiftString(intent.title)}"`,
      intent.description
        ? `  static let description = IntentDescription("${escapeSwiftString(intent.description)}")`
        : '  static let description = IntentDescription("")',
      `  static let openAppWhenRun = ${intent.behavior.opensAppToForeground ? "true" : "false"}`,
      "",
      ...(parameters.length === 0 ? [] : parameters.flatMap((parameter) => [parameter, ""])),
      "  func perform() async throws -> some IntentResult {",
      `    let payload = try JSONEncoder().encode(${payloadTypeName}(${payloadArguments}))`,
      "    let payloadString = String(decoding: payload, as: UTF8.self)",
      "    var components = URLComponents()",
      `    components.scheme = "${escapeSwiftString(scheme)}"`,
      '    components.host = "app-intents"',
      `    components.path = "/${escapeSwiftString(intent.id)}"`,
      `    components.queryItems = ${queryItems}`,
      "",
      "    guard let url = components.url else {",
      "      throw NSError(",
      '        domain: "ReactNativeAppIntents",',
      "        code: 1,",
      '        userInfo: [NSLocalizedDescriptionKey: "Could not create app-intents URL."]',
      "      )",
      "    }",
      "",
      "    enqueueReactNativeAppIntentURL(url)",
      "    return .result()",
      "  }",
      "}",
      "",
    );
  }

  const shortcuts = intentMetadata
    .filter((intent) => intent.surfaces.appShortcut)
    .map((intent) => {
      const typeName = `${toPascalCase(intent.id)}Intent`;
      const phrases = [...new Set(intent.phrases.map((phrase) => phrase.appShortcutPhrase))].map(
        (phrase) => `          "${toSwiftAppShortcutPhrase(phrase)}",`,
      );

      return [
        "      AppShortcut(",
        `        intent: ${typeName}(),`,
        "        phrases: [",
        ...phrases,
        "        ],",
        `        shortTitle: "${escapeSwiftString(intent.title)}",`,
        '        systemImageName: "square.grid.2x2"',
        "      ),",
      ].join("\n");
    });

  declarations.push(
    "@available(iOS 16.0, *)",
    `struct ${providerName}: AppShortcutsProvider {`,
    "  static var appShortcuts: [AppShortcut] {",
    "    return [",
    ...shortcuts,
    "    ]",
    "  }",
    "}",
    "",
  );

  return declarations.join("\n");
}

function renderAndroidShortcuts(
  intentMetadata: readonly NormalizedIntentMetadata[],
  scheme: string,
  packageName: string,
): string {
  const shortcuts = getAndroidShortcutArtifacts(intentMetadata, scheme).map((shortcut) =>
    [
      "    <shortcut",
      `        android:shortcutId="${escapeXml(shortcut.id)}"`,
      '        android:enabled="true"',
      '        android:icon="@mipmap/ic_launcher"',
      `        android:shortcutShortLabel="@string/${shortcut.shortLabelResourceName}"`,
      `        android:shortcutLongLabel="@string/${shortcut.longLabelResourceName}">`,
      "        <intent",
      '            android:action="android.intent.action.VIEW"',
      `            android:targetPackage="${escapeXml(packageName)}"`,
      `            android:targetClass="${escapeXml(`${packageName}.MainActivity`)}"`,
      `            android:data="${escapeXml(shortcut.url)}" />`,
      "    </shortcut>",
    ].join("\n"),
  );

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">',
    ...shortcuts,
    "</shortcuts>",
    "",
  ].join("\n");
}

function renderAndroidShortcutStrings(
  intentMetadata: readonly NormalizedIntentMetadata[],
  scheme: string,
): string {
  const strings = getAndroidShortcutArtifacts(intentMetadata, scheme).flatMap((shortcut) => [
    `    <string name="${shortcut.shortLabelResourceName}">${escapeXml(shortcut.shortLabel)}</string>`,
    `    <string name="${shortcut.longLabelResourceName}">${escapeXml(shortcut.longLabel)}</string>`,
  ]);

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<resources>",
    ...strings,
    "</resources>",
    "",
  ].join("\n");
}

function resolveAndroidShortcutStringsOutput(config: AppIntentsConfig["android"]): string {
  if (!config) {
    throw new Error("android config is required to resolve Android shortcut string output.");
  }

  if (config.shortcutsStringsOutput) {
    return config.shortcutsStringsOutput;
  }

  const shortcutsOutputFileName = basename(config.shortcutsOutput, ".xml");
  const resDirectory = dirname(dirname(config.shortcutsOutput));

  return join(resDirectory, "values", `${shortcutsOutputFileName}_strings.xml`);
}

function formatTypeScriptPropertyKey(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : JSON.stringify(value);
}

function renderTypes(
  intentSources: readonly LoadedIntentSource[],
  typesOutputPath: string,
): string {
  const imports: string[] = [
    'import type { ParamsOf } from "@react-native-app-intents/core";',
    'import type { IntentEventUnion } from "@react-native-app-intents/react-native";',
  ];
  const tupleEntries: string[] = [];
  const mapEntries: string[] = [];

  intentSources.forEach((source, index) => {
    const symbolName = `Intent${index}`;
    const importPath = relative(dirname(typesOutputPath), source.absolutePath)
      .replaceAll("\\", "/")
      .replace(/\.ts$/, ".js");
    const normalizedImportPath = importPath.startsWith(".") ? importPath : `./${importPath}`;

    if (source.importKind === "default") {
      imports.push(`import ${symbolName} from "${normalizedImportPath}";`);
    } else {
      imports.push(
        `import { ${source.exportName} as ${symbolName} } from "${normalizedImportPath}";`,
      );
    }

    tupleEntries.push(`typeof ${symbolName}`);
    mapEntries.push(
      `  ${formatTypeScriptPropertyKey(source.intent.id)}: ParamsOf<typeof ${symbolName}>;`,
    );
  });

  const generatedTupleDeclaration =
    tupleEntries.length === 1
      ? `export declare const generatedAppIntents: readonly [${tupleEntries[0]}];`
      : [
          "export declare const generatedAppIntents: readonly [",
          ...tupleEntries.map((entry) => `  ${entry},`),
          "];",
        ].join("\n");

  return [
    "// Generated by react-native-app-intents. Do not edit manually.",
    ...imports,
    "",
    generatedTupleDeclaration,
    "",
    "export interface GeneratedAppIntentMap {",
    ...mapEntries,
    "}",
    "",
    "export type GeneratedAppIntentId = keyof GeneratedAppIntentMap;",
    "export type GeneratedAppIntentEvent = IntentEventUnion<typeof generatedAppIntents>;",
    "",
  ].join("\n");
}

function ensureAndroidManifest(manifest: string, config: AppIntentsConfig): string {
  if (!config.android?.manifest || !config.android.shortcutsOutput) {
    return manifest;
  }

  let updatedManifest = manifest;
  const shortcutsResourceName = basename(config.android.shortcutsOutput, ".xml");

  if (!updatedManifest.includes('android:name="android.app.shortcuts"')) {
    updatedManifest = updatedManifest.replace(
      /<application([^>]*)>/,
      `<application$1>\n      <meta-data\n        android:name="android.app.shortcuts"\n        android:resource="@xml/${shortcutsResourceName}" />`,
    );
  }

  if (
    !updatedManifest.includes(`android:scheme="${config.scheme}"`) ||
    !updatedManifest.includes('android:host="app-intents"')
  ) {
    updatedManifest = updatedManifest.replace(
      /(<activity[\s\S]*?android:name="\.MainActivity"[\s\S]*?>)([\s\S]*?)(<\/activity>)/,
      `$1$2        <intent-filter>\n            <action android:name="android.intent.action.VIEW" />\n            <category android:name="android.intent.category.DEFAULT" />\n            <category android:name="android.intent.category.BROWSABLE" />\n            <data\n              android:scheme="${config.scheme}"\n              android:host="app-intents" />\n        </intent-filter>\n$3`,
    );
  }

  return updatedManifest;
}

async function readExistingFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function writeArtifact(
  artifact: GeneratedArtifact & { content: string },
  check: boolean,
): Promise<boolean> {
  const existing = await readExistingFile(artifact.path);

  if (check) {
    if (existing !== artifact.content) {
      throw new Error(`Generated artifact is out of date: ${artifact.path}`);
    }

    return false;
  }

  if (existing === artifact.content) {
    return false;
  }

  await mkdir(dirname(artifact.path), { recursive: true });
  await writeFile(artifact.path, artifact.content, "utf8");
  return true;
}

async function renderArtifacts(config: AppIntentsConfig, cwd: string): Promise<RenderedArtifacts> {
  const intentSources = await loadIntentSources(config.intents, cwd);
  const normalizedIntents = normalizeIntentDefinitions(
    intentSources.map((source) => source.intent),
  );
  const artifacts: Array<GeneratedArtifact & { content: string }> = [];

  if (config.ios?.output) {
    artifacts.push({
      content: renderSwift(
        normalizedIntents,
        config.scheme,
        config.ios.appShortcutsProviderName ?? "GeneratedAppShortcuts",
      ),
      path: resolve(cwd, config.ios.output),
      platform: "ios",
    });
  }

  if (config.android?.shortcutsOutput) {
    if (!config.android.packageName) {
      throw new Error("android.packageName is required when generating Android shortcuts.");
    }

    artifacts.push({
      content: renderAndroidShortcuts(normalizedIntents, config.scheme, config.android.packageName),
      path: resolve(cwd, config.android.shortcutsOutput),
      platform: "android",
    });
    artifacts.push({
      content: renderAndroidShortcutStrings(normalizedIntents, config.scheme),
      path: resolve(cwd, resolveAndroidShortcutStringsOutput(config.android)),
      platform: "android",
    });
  }

  if (config.types?.output) {
    artifacts.push({
      content: renderTypes(intentSources, resolve(cwd, config.types.output)),
      path: resolve(cwd, config.types.output),
      platform: "types",
    });
  }

  const androidManifest = config.android?.manifest
    ? ensureAndroidManifest(
        (await readExistingFile(resolve(cwd, config.android.manifest))) ?? "<manifest />",
        config,
      )
    : undefined;

  return {
    artifacts,
    ...(androidManifest ? { androidManifest } : {}),
  };
}

export async function generateAppIntents(
  config: AppIntentsConfig,
  options: GenerateAppIntentsOptions = {},
): Promise<GenerateAppIntentsResult> {
  const cwd = options.cwd ?? process.cwd();
  const rendered = await renderArtifacts(config, cwd);
  let changed = false;

  for (const artifact of rendered.artifacts) {
    changed = (await writeArtifact(artifact, options.check === true)) || changed;
  }

  if (config.android?.manifest && rendered.androidManifest !== undefined) {
    changed =
      (await writeArtifact(
        {
          content: rendered.androidManifest,
          path: resolve(cwd, config.android.manifest),
          platform: "android",
        },
        options.check === true,
      )) || changed;
  }

  return {
    artifacts: rendered.artifacts.map(({ content: _content, ...artifact }) => artifact),
    changed,
    message:
      options.check === true
        ? "Generated artifacts are up to date."
        : rendered.artifacts.length === 0
          ? "No outputs configured."
          : `Wrote ${rendered.artifacts.length} generated artifact${rendered.artifacts.length === 1 ? "" : "s"}.`,
  };
}
