export interface NativeShortcutPayload {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

export interface AppIntentsNativeModule {
  donate(intentId: string, payload: string): Promise<void>;
  getInitialIntentURL?(): Promise<string | null>;
  updateDynamicShortcuts(shortcuts: readonly NativeShortcutPayload[]): Promise<void>;
}
