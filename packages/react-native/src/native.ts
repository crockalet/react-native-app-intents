import type { DynamicShortcutIcon } from "./core/index.js";

export interface NativeShortcutPayload {
  id: string;
  icon?: DynamicShortcutIcon;
  title: string;
  subtitle?: string;
  url: string;
}

export interface AppIntentsNativeModule {
  clearDonations(): Promise<void>;
  donate(intentId: string, title: string, url: string, payload: string): Promise<void>;
  getInitialIntentURL?(): Promise<string | null>;
  updateDynamicShortcuts(shortcuts: readonly NativeShortcutPayload[]): Promise<void>;
}
