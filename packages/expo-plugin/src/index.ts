import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  IOSConfig,
  createRunOncePlugin,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
  type ConfigPlugin,
} from "@expo/config-plugins";
import type { InfoPlist } from "@expo/config-plugins/build/ios/IosConfig.types";
import {
  defineAppIntentsConfig,
  generateAppIntents,
  type AppIntentsConfig,
  type AppIntentsConfigInput,
} from "@react-native-app-intents/codegen";

const EXPO_PLUGIN_PACKAGE_NAME = "@react-native-app-intents/expo-plugin";
const GENERATED_IOS_SOURCE_FILE_NAME = "GeneratedAppIntents.swift";
const DEFAULT_ANDROID_MANIFEST_PATH = "android/app/src/main/AndroidManifest.xml";
const DEFAULT_ANDROID_SHORTCUTS_PATH = "android/app/src/main/res/xml/app_intents_shortcuts.xml";

export type ExpoAppIntentsPluginOptions = AppIntentsConfigInput;
type NativeExpoConfig = Parameters<ConfigPlugin<unknown>>[0];
type JSONPrimitive = string | number | boolean | null;
type JSONValue = JSONPrimitive | JSONValue[] | { [key: string]: JSONValue | undefined };
type JSONObject = { [key: string]: JSONValue | undefined };
type ExpoAppConfig = NativeExpoConfig & { plugins?: unknown[] };
type ExpoPluginUserConfig = { plugins?: unknown[]; [key: string]: unknown };

export type AppIntentsPluginEntry = readonly [typeof EXPO_PLUGIN_PACKAGE_NAME, AppIntentsConfig];

export function withAppIntents<TConfig extends ExpoPluginUserConfig>(
  config: TConfig,
  options: ExpoAppIntentsPluginOptions,
): TConfig & { plugins: unknown[] } {
  const plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];

  plugins.push([EXPO_PLUGIN_PACKAGE_NAME, defineAppIntentsConfig(options)]);

  return { ...config, plugins };
}

export function applyInfoPlistAppIntentsConfig(
  infoPlist: InfoPlist,
  options: AppIntentsConfig,
) : InfoPlist {
  const urlTypes = Array.isArray(infoPlist.CFBundleURLTypes) ? [...infoPlist.CFBundleURLTypes] : [];
  const schemeConfigured = urlTypes.some((entry) =>
    Array.isArray(entry.CFBundleURLSchemes) &&
    entry.CFBundleURLSchemes.includes(options.scheme),
  );

  if (!schemeConfigured) {
    urlTypes.push({
      CFBundleURLSchemes: [options.scheme],
    });
  }

  infoPlist.CFBundleURLTypes = urlTypes;

  if (options.ios?.siriUsageDescription) {
    infoPlist.NSSiriUsageDescription = options.ios.siriUsageDescription;
  }

  if (options.ios?.appGroupIdentifier) {
    infoPlist.ReactNativeAppIntentsAppGroupIdentifier = options.ios.appGroupIdentifier;
  }

  return infoPlist;
}

export function applyEntitlementsAppIntentsConfig(
  entitlements: JSONObject,
  options: AppIntentsConfig,
): JSONObject {
  if (!options.ios?.appGroupIdentifier) {
    return entitlements;
  }

  const groups = Array.isArray(entitlements["com.apple.security.application-groups"])
    ? [...(entitlements["com.apple.security.application-groups"] as string[])]
    : [];

  if (!groups.includes(options.ios.appGroupIdentifier)) {
    groups.push(options.ios.appGroupIdentifier);
  }

  entitlements["com.apple.security.application-groups"] = groups;
  return entitlements;
}

export function patchSwiftAppDelegate(source: string): string {
  let patched = source;

  if (!patched.includes("import ReactNativeAppIntents")) {
    const importMatches = [...patched.matchAll(/^import .+$/gm)];
    const insertIndex =
      importMatches.length > 0
        ? (importMatches.at(-1)?.index ?? 0) + (importMatches.at(-1)?.[0].length ?? 0)
        : 0;
    patched = `${patched.slice(0, insertIndex)}\nimport ReactNativeAppIntents${patched.slice(insertIndex)}`;
  }

  patched = injectColdLaunchShortcutHandling(patched);
  patched = injectQuickActionHandlerMethods(patched);

  return patched;
}

export function resolveExpoCodegenConfig(
  config: ExpoAppConfig,
  options: AppIntentsConfig,
  projectRoot: string,
  platform: "ios" | "android",
  iosProjectName?: string,
): AppIntentsConfig {
  const iosBundleIdentifier = options.ios?.bundleIdentifier ?? config.ios?.bundleIdentifier;
  const androidPackageName = options.android?.packageName ?? config.android?.package;

  return defineAppIntentsConfig({
    intents: options.intents,
    scheme: options.scheme,
    ...(platform === "ios" && iosProjectName
      ? {
          ios: {
            output: join(
              "ios",
              iosProjectName,
              basename(options.ios?.output ?? GENERATED_IOS_SOURCE_FILE_NAME),
            ).replaceAll("\\", "/"),
            ...(options.ios?.appGroupIdentifier
              ? { appGroupIdentifier: options.ios.appGroupIdentifier }
              : {}),
            ...(options.ios?.appShortcutsProviderName
              ? { appShortcutsProviderName: options.ios.appShortcutsProviderName }
              : {}),
            ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}),
            ...(options.ios?.siriUsageDescription
              ? { siriUsageDescription: options.ios.siriUsageDescription }
              : {}),
          },
        }
      : {}),
    ...(platform === "android" && androidPackageName
      ? {
          android: {
            manifest: DEFAULT_ANDROID_MANIFEST_PATH,
            packageName: androidPackageName,
            shortcutsOutput: join(
              "android/app/src/main/res/xml",
              basename(options.android?.shortcutsOutput ?? DEFAULT_ANDROID_SHORTCUTS_PATH),
            ).replaceAll("\\", "/"),
          },
        }
      : {}),
    ...(options.types ? { types: options.types } : {}),
  });
}

async function resolveIOSProjectName(projectRoot: string): Promise<string> {
  const iosRoot = join(projectRoot, "ios");
  const entries = await readdir(iosRoot, { withFileTypes: true });
  const project = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(".xcodeproj"));

  if (!project) {
    throw new Error("Could not locate an iOS .xcodeproj to configure react-native-app-intents.");
  }

  return basename(project.name, ".xcodeproj");
}

async function patchExpoAppDelegate(projectRoot: string, projectName: string): Promise<void> {
  const appDelegatePath = join(projectRoot, "ios", projectName, "AppDelegate.swift");
  const source = await readFile(appDelegatePath, "utf8");
  const patched = patchSwiftAppDelegate(source);

  if (patched !== source) {
    await writeFile(appDelegatePath, patched, "utf8");
  }
}

async function runPlatformCodegen(
  config: ExpoAppConfig,
  options: AppIntentsConfig,
  projectRoot: string,
  platform: "ios" | "android",
): Promise<void> {
  if (platform === "ios") {
    const iosProjectName = await resolveIOSProjectName(projectRoot);
    await generateAppIntents(resolveExpoCodegenConfig(config, options, projectRoot, "ios", iosProjectName), {
      cwd: projectRoot,
    });
    await patchExpoAppDelegate(projectRoot, iosProjectName);
    return;
  }

  await generateAppIntents(resolveExpoCodegenConfig(config, options, projectRoot, "android"), {
    cwd: projectRoot,
  });
}

function withGeneratedIOSSource(config: ExpoAppConfig, options: AppIntentsConfig): ExpoAppConfig {
  return withXcodeProject(config, (currentConfig) => {
    const project = currentConfig.modResults as any;
    const modRequest = currentConfig.modRequest as { projectName?: string; projectRoot: string };
    const projectName =
      modRequest.projectName ??
      ((IOSConfig.XcodeUtils as unknown as { getProjectName(projectRoot: string): string }).getProjectName(
        modRequest.projectRoot,
      ) as string);
    const filePath = `${projectName}/${basename(options.ios?.output ?? GENERATED_IOS_SOURCE_FILE_NAME)}`;
    const fileReferenceSection = project.pbxFileReferenceSection();
    const alreadyAdded = Object.values(fileReferenceSection).some(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "path" in value &&
        typeof (value as { path?: unknown }).path === "string" &&
        (value as { path: string }).path.replaceAll('"', "") === basename(filePath),
    );

    if (!alreadyAdded) {
      const xcodeUtils = IOSConfig.XcodeUtils as unknown as {
        findFirstTarget(xcodeProject: any): { uuid: string };
        pbxAddSourceFile(
          xcodeProject: any,
          filePath: string,
          opts: { target: string },
          group: string,
        ): void;
        pbxCreateFileReferenceSection(xcodeProject: any, filePath: string): void;
      };
      const target = xcodeUtils.findFirstTarget(project);

      xcodeUtils.pbxCreateFileReferenceSection(project, filePath);
      xcodeUtils.pbxAddSourceFile(project, filePath, { target: target.uuid }, projectName);
    }

    return currentConfig;
  });
}

const withReactNativeAppIntentsBase: ConfigPlugin<ExpoAppIntentsPluginOptions> = (
  config: NativeExpoConfig,
  rawOptions: ExpoAppIntentsPluginOptions,
): NativeExpoConfig => {
  let currentConfig = config as ExpoAppConfig;
  const options = defineAppIntentsConfig(rawOptions);

  currentConfig = withInfoPlist(currentConfig, (modConfig) => {
    modConfig.modResults = applyInfoPlistAppIntentsConfig(modConfig.modResults, options);
    return modConfig;
  });

  currentConfig = withEntitlementsPlist(currentConfig, (modConfig) => {
    modConfig.modResults = applyEntitlementsAppIntentsConfig(modConfig.modResults, options);
    return modConfig;
  });

  currentConfig = withGeneratedIOSSource(currentConfig, options);

  currentConfig = withDangerousMod(currentConfig, [
    "ios",
    async (modConfig) => {
      await runPlatformCodegen(currentConfig, options, modConfig.modRequest.projectRoot, "ios");
      return modConfig;
    },
  ]);

  currentConfig = withDangerousMod(currentConfig, [
    "android",
    async (modConfig) => {
      try {
        await access(join(modConfig.modRequest.projectRoot, DEFAULT_ANDROID_MANIFEST_PATH));
      } catch {
        return modConfig;
      }

      await runPlatformCodegen(currentConfig, options, modConfig.modRequest.projectRoot, "android");
      return modConfig;
    },
  ]);

  return currentConfig;
};

function injectColdLaunchShortcutHandling(source: string): string {
  const snippet = "launchOptions?[.shortcutItem] as? UIApplicationShortcutItem";

  if (source.includes(snippet)) {
    return source;
  }

  const signatureIndex = source.indexOf("didFinishLaunchingWithOptions");

  if (signatureIndex === -1) {
    throw new Error("Could not find didFinishLaunchingWithOptions in AppDelegate.swift.");
  }

  const functionStart = source.lastIndexOf("func application(", signatureIndex);
  const braceStart = source.indexOf("{", signatureIndex);
  const braceEnd = findMatchingBrace(source, braceStart);
  const functionSource = source.slice(functionStart, braceEnd + 1);
  const returnMatch = [...functionSource.matchAll(/\n(\s*)return [^\n]+/g)].at(-1);

  if (!returnMatch || returnMatch.index === undefined) {
    throw new Error("Could not find the final return statement in didFinishLaunchingWithOptions.");
  }

  const indent = returnMatch[1];
  const injection =
    `\n${indent}if let shortcutItem = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem,\n` +
    `${indent}   handleShortcutItem(shortcutItem) {\n` +
    `${indent}  return false\n` +
    `${indent}}\n`;
  const insertIndex = functionStart + returnMatch.index;

  return `${source.slice(0, insertIndex)}${injection}${source.slice(insertIndex)}`;
}

function injectQuickActionHandlerMethods(source: string): string {
  if (source.includes("performActionFor shortcutItem: UIApplicationShortcutItem")) {
    return source;
  }

  const finalClassBrace = source.lastIndexOf("\n}");

  if (finalClassBrace === -1) {
    throw new Error("Could not locate the AppDelegate class closing brace.");
  }

  const methods = [
    "",
    "  func application(",
    "    _ application: UIApplication,",
    "    performActionFor shortcutItem: UIApplicationShortcutItem,",
    "    completionHandler: @escaping (Bool) -> Void",
    "  ) {",
    "    completionHandler(handleShortcutItem(shortcutItem))",
    "  }",
    "",
    "  private func handleShortcutItem(_ shortcutItem: UIApplicationShortcutItem) -> Bool {",
    '    guard let url = shortcutItem.userInfo?["url"] as? String else {',
    "      return false",
    "    }",
    "",
    "    ReactNativeAppIntents.recordIncomingURLString(url)",
    "    return true",
    "  }",
  ].join("\n");

  return `${source.slice(0, finalClassBrace)}${methods}${source.slice(finalClassBrace)}`;
}

function findMatchingBrace(source: string, braceStart: number): number {
  let depth = 0;

  for (let index = braceStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error("Could not find the matching closing brace in AppDelegate.swift.");
}

const withReactNativeAppIntents = createRunOncePlugin(
  withReactNativeAppIntentsBase,
  EXPO_PLUGIN_PACKAGE_NAME,
  "0.0.0",
);

export default withReactNativeAppIntents;
