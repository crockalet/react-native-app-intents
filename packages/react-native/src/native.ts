import type { DynamicShortcutIcon } from "./core/index.js";

export interface NativeShortcutCapabilityParameterBinding {
  key: string;
  value: string;
}

export interface NativeShortcutCapabilityBinding {
  capabilityName: string;
  parameterBindings: readonly NativeShortcutCapabilityParameterBinding[];
}

export interface NativeShortcutPayload {
  capabilityBindings?: readonly NativeShortcutCapabilityBinding[];
  id: string;
  icon?: DynamicShortcutIcon;
  title: string;
  subtitle?: string;
  url: string;
}

export interface AppIntentsNativeModule {
  clearDonations(): Promise<void>;
  donate(
    intentId: string,
    title: string,
    url: string,
    payload: string,
    capabilityBindings?: readonly NativeShortcutCapabilityBinding[],
  ): Promise<void>;
  getInitialIntentURL?(): Promise<string | null>;
  updateDynamicShortcuts(shortcuts: readonly NativeShortcutPayload[]): Promise<void>;
}
