import type { AnyParameterDefinition, InferParams, LocalizedText } from "./schema.js";

export interface ShortcutIcon {
  /** Android drawable or mipmap resource used for launcher and Assistant shortcuts. */
  androidResourceName?: string;
  /** iOS SF Symbol name used for App Shortcuts. */
  systemName?: string;
}

export interface DynamicShortcutIcon extends ShortcutIcon {
  /** iOS asset catalog template image name used for donated dynamic shortcuts. */
  iosTemplateImageName?: string;
}

export interface AppShortcutSurfaceOptions {
  /** Icon metadata for the generated App Shortcut. */
  icon?: ShortcutIcon;
}

/** Controls where an intent is exposed by generated native integrations. */
export interface IntentSurfaces {
  /**
   * Legacy Siri surface marker.
   *
   * Do not set this directly; configure `ios.appIntent` instead. Validation derives this
   * surface automatically when native App Intent options are present.
   */
  siri?: boolean;
  /** Exposes the intent to iOS Spotlight indexing. */
  spotlight?: boolean;
  /**
   * Exposes the intent as an iOS App Shortcut and Android static shortcut.
   *
   * Set to `true` for the default shortcut metadata, or pass an object to customize the icon.
   */
  appShortcut?: boolean | AppShortcutSurfaceOptions;
  /** @deprecated Use `android.appAction` instead. */
  assistant?: boolean;
}

export interface IntentBehavior {
  /** Whether the native intent should open the app foreground before completion. */
  opensAppToForeground?: boolean;
}

export interface IOSAppIntentResponseOptions {
  /** Static dialog returned by the generated iOS App Intent. */
  dialog?: LocalizedText;
}

export interface IOSAppIntentOptions {
  /** Response metadata returned by the generated iOS App Intent. */
  response?: IOSAppIntentResponseOptions;
}

export interface IntentIOSOptions {
  /** Enables generation of a native iOS App Intent for this intent. */
  appIntent?: IOSAppIntentOptions;
}

export type AndroidAppActionFulfillment = "deeplink";
export type AndroidAppActionInventoryStrategy = "static" | "dynamic";

export interface AndroidAppActionOptions {
  /** Built-in Intent capability name, such as `actions.intent.GET_ORDER`. */
  capability: string;
  /** Fulfillment mode for the generated Android capability. */
  fulfillment?: AndroidAppActionFulfillment;
  /** Inventory strategy used when entity parameters back Android shortcuts. */
  inventory?: {
    /** Whether inventory is emitted statically at build time or supplied dynamically at runtime. */
    strategy?: AndroidAppActionInventoryStrategy;
  };
}

export interface IntentAndroidOptions {
  /** Enables generation of an Android App Action capability for this intent. */
  appAction?: AndroidAppActionOptions;
}

export interface IntentDefinition<
  TParams extends Record<string, AnyParameterDefinition> = Record<string, AnyParameterDefinition>,
> {
  /** Internal marker used to identify intent definitions during codegen. */
  kind: "intent";
  /** Stable identifier used in generated URLs, event ids, shortcuts, and native declarations. */
  id: string;
  /** User-facing intent title. */
  title: LocalizedText;
  /** Longer user-facing description shown by native surfaces when supported. */
  description?: LocalizedText;
  /** Invocation phrases for App Shortcuts and Assistant-style surfaces. */
  phrases?: readonly string[] | Partial<Record<string, readonly string[]>>;
  /** Typed parameters accepted by this intent. */
  params: TParams;
  /** Native surfaces where this intent should be exposed. */
  surfaces?: IntentSurfaces;
  /** Android-specific generation options. */
  android?: IntentAndroidOptions;
  /** iOS-specific generation options. */
  ios?: IntentIOSOptions;
  /** @deprecated Use `android.appAction.capability` instead. */
  androidBii?: string;
  /** Runtime behavior options for generated native integrations. */
  behavior?: IntentBehavior;
}

/** Infers the runtime params object for an intent definition. */
export type ParamsOf<TIntent extends IntentDefinition<any>> = InferParams<TIntent["params"]>;

/** Defines an app intent that codegen can expose through native integrations. */
export function defineIntent<const TParams extends Record<string, AnyParameterDefinition>>(
  config: Omit<IntentDefinition<TParams>, "kind">,
): IntentDefinition<TParams> {
  return { kind: "intent", ...config };
}
