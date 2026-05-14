export interface AndroidAppActionCatalogEntry {
  optionalParameterNames?: readonly string[];
  requiredParameterNames?: readonly string[];
}

export const ANDROID_APP_ACTION_CATALOG_VERSION = "2026-05-initial";

export const ANDROID_APP_ACTION_CATALOG: Readonly<Record<string, AndroidAppActionCatalogEntry>> = {
  "actions.intent.GET_ORDER": {
    requiredParameterNames: ["order"],
  },
};
