import type { AnyParameterDefinition, LocalizedText } from "./schema.js";
import type { IntentBehavior, IntentDefinition, IntentSurfaces } from "./intent.js";

const APP_NAME_PLACEHOLDER = "${.applicationName}";
const PLACEHOLDER_PATTERN = /\$\{([^}]+)\}/g;

export class AppIntentsValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "AppIntentsValidationError";
    this.issues = issues;
  }
}

export interface NormalizedPhraseMetadata {
  appShortcutPhrase: string;
  placeholders: readonly string[];
  raw: string;
}

export interface NormalizedParameterMetadata {
  defaultValue?: unknown;
  entityId?: string;
  fields?: readonly NormalizedParameterMetadata[];
  hasDefault: boolean;
  kind: AnyParameterDefinition["kind"];
  name: string;
  optional: boolean;
  prompt?: string;
  requestValueDialog?: string;
  title: string;
}

export interface NormalizedIntentMetadata<
  TIntent extends IntentDefinition<any> = IntentDefinition<any>,
> {
  androidBii?: string;
  behavior: Required<IntentBehavior>;
  description?: string;
  id: string;
  intent: TIntent;
  params: readonly NormalizedParameterMetadata[];
  phrases: readonly NormalizedPhraseMetadata[];
  surfaces: Required<IntentSurfaces>;
  title: string;
}

function appendIssue(issues: string[], intentId: string, message: string): void {
  issues.push(`[${intentId}] ${message}`);
}

function collectPhrasePlaceholders(phrase: string): string[] {
  const placeholders: string[] = [];

  for (const match of phrase.matchAll(PLACEHOLDER_PATTERN)) {
    const placeholder = match[1];

    if (placeholder) {
      placeholders.push(placeholder);
    }
  }

  return placeholders;
}

function normalizeAppShortcutPhrase(
  rawPhrase: string,
  paramNames: ReadonlySet<string>,
): NormalizedPhraseMetadata {
  const placeholders = collectPhrasePlaceholders(rawPhrase);
  let appShortcutPhrase = rawPhrase;
  let includesApplicationName = false;

  for (const placeholder of placeholders) {
    if (placeholder === ".applicationName") {
      includesApplicationName = true;
      continue;
    }

    if (!paramNames.has(placeholder)) {
      continue;
    }

    appShortcutPhrase = appShortcutPhrase.replace(new RegExp(`\\$\\{${placeholder}\\}`, "g"), "");
  }

  appShortcutPhrase = appShortcutPhrase.replace(/\s+/g, " ").trim();

  if (!includesApplicationName) {
    appShortcutPhrase =
      appShortcutPhrase.length === 0
        ? APP_NAME_PLACEHOLDER
        : `${appShortcutPhrase} in ${APP_NAME_PLACEHOLDER}`;
  }

  return {
    appShortcutPhrase,
    placeholders,
    raw: rawPhrase,
  };
}

function normalizeParameterMetadata(
  name: string,
  definition: AnyParameterDefinition,
): NormalizedParameterMetadata {
  const metadata: NormalizedParameterMetadata = {
    hasDefault: "default" in definition && definition.default !== undefined,
    kind: definition.kind,
    name,
    optional: definition.optional === true,
    title: resolveLocalizedText(definition.title, name) ?? name,
  };

  const prompt = resolveLocalizedText(definition.prompt);
  const requestValueDialog = resolveLocalizedText(definition.requestValueDialog);

  if (prompt) {
    metadata.prompt = prompt;
  }

  if (requestValueDialog) {
    metadata.requestValueDialog = requestValueDialog;
  }

  if ("default" in definition && definition.default !== undefined) {
    metadata.defaultValue = definition.default;
  }

  if (definition.kind === "object") {
    metadata.fields = Object.entries(definition.fields).map(([fieldName, field]) =>
      normalizeParameterMetadata(fieldName, field),
    );
  }

  if (definition.kind === "entity") {
    metadata.entityId = definition.entity.id;
  }

  return metadata;
}

function normalizePhrases(
  intent: IntentDefinition<any>,
  issues: string[],
): readonly NormalizedPhraseMetadata[] {
  const localizedPhrases = intent.phrases;

  if (!localizedPhrases) {
    return [];
  }

  const phrases = Array.isArray(localizedPhrases)
    ? localizedPhrases
    : ((localizedPhrases as Partial<Record<string, readonly string[]>>).en ??
      Object.values(localizedPhrases as Partial<Record<string, readonly string[]>>)[0] ??
      []);
  const paramNames = new Set(Object.keys(intent.params));

  return (phrases as readonly string[]).map((phrase) => {
    const metadata = normalizeAppShortcutPhrase(phrase, paramNames);

    for (const placeholder of metadata.placeholders) {
      if (placeholder === ".applicationName") {
        continue;
      }

      if (!paramNames.has(placeholder)) {
        appendIssue(
          issues,
          intent.id,
          `Phrase "${phrase}" references unknown placeholder "${placeholder}".`,
        );
      }
    }

    return metadata;
  });
}

function normalizeSurfaces(surfaces: IntentSurfaces | undefined): Required<IntentSurfaces> {
  return {
    appShortcut: surfaces?.appShortcut === true,
    assistant: surfaces?.assistant === true,
    siri: surfaces?.siri === true,
    spotlight: surfaces?.spotlight === true,
  };
}

function normalizeBehavior(behavior: IntentBehavior | undefined): Required<IntentBehavior> {
  return {
    opensAppToForeground: behavior?.opensAppToForeground === true,
  };
}

export function resolveLocalizedText(
  value: LocalizedText | undefined,
  fallback?: string,
): string | undefined {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return value;
  }

  if ("en" in value && typeof value.en === "string") {
    return value.en;
  }

  const firstEntry = Object.values(value)[0];

  return typeof firstEntry === "string" ? firstEntry : fallback;
}

export function normalizeIntentDefinition<TIntent extends IntentDefinition<any>>(
  intent: TIntent,
): NormalizedIntentMetadata<TIntent> {
  const issues: string[] = [];
  const params = (Object.entries(intent.params) as [string, AnyParameterDefinition][]).map(
    ([name, definition]) => normalizeParameterMetadata(name, definition),
  );
  const phrases = normalizePhrases(intent, issues);
  const surfaces = normalizeSurfaces(intent.surfaces);

  if (surfaces.appShortcut && phrases.length === 0) {
    appendIssue(issues, intent.id, "App Shortcut intents must declare at least one phrase.");
  }

  if (issues.length > 0) {
    throw new AppIntentsValidationError(issues);
  }

  const normalized: Omit<NormalizedIntentMetadata<TIntent>, "androidBii" | "description"> & {
    androidBii?: string;
    description?: string;
  } = {
    behavior: normalizeBehavior(intent.behavior),
    id: intent.id,
    intent,
    params,
    phrases,
    surfaces,
    title: resolveLocalizedText(intent.title, intent.id) ?? intent.id,
  };
  const description = resolveLocalizedText(intent.description);

  if (intent.androidBii) {
    normalized.androidBii = intent.androidBii;
  }

  if (description) {
    normalized.description = description;
  }

  return normalized as NormalizedIntentMetadata<TIntent>;
}

export function normalizeIntentDefinitions<TIntents extends readonly IntentDefinition<any>[]>(
  intents: TIntents,
): readonly NormalizedIntentMetadata<TIntents[number]>[] {
  const normalized = intents.map((intent) => normalizeIntentDefinition(intent));
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];

  for (const intent of normalized) {
    if (seenIds.has(intent.id)) {
      duplicateIds.push(intent.id);
      continue;
    }

    seenIds.add(intent.id);
  }

  if (duplicateIds.length > 0) {
    throw new AppIntentsValidationError(
      duplicateIds.map((intentId) => `Duplicate intent id "${intentId}".`),
    );
  }

  return normalized;
}
