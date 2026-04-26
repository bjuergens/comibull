// localStorage-backed settings. Replaces the server-side users.settings JSONB
// and ai_settings table. Small enough for localStorage; API key fits trivially.
//
// Reads validate via arktype's .assert() — malformed JSON or shape drift throws
// loudly and bubbles to the global error handler. Schema bumps wipe IndexedDB
// (see store.ts); localStorage follows the same lean policy: if a previous
// version's settings shape no longer parses, the user clears them in Settings.

import {
  type AiCallType,
  type CallTypeConfig,
  callTypeConfigSchema,
  DEFAULT_AI_CONFIG,
  DEFAULT_USER_SETTINGS,
  modelConfigMapSchema,
  type UserSettings,
  userSettingsSchema,
} from './shared-types';

const KEYS = {
  apiKey: 'anthropic_api_key',
  settings: 'user_settings',
  modelConfig: 'ai_model_config',
  debugMode: 'debug_mode',
} as const;

export function readApiKey(): string | null {
  return localStorage.getItem(KEYS.apiKey);
}

export function writeApiKey(key: string): void {
  localStorage.setItem(KEYS.apiKey, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(KEYS.apiKey);
}

export function readUserSettings(): UserSettings {
  const raw = localStorage.getItem(KEYS.settings);
  if (!raw) return DEFAULT_USER_SETTINGS;
  return userSettingsSchema.assert(JSON.parse(raw));
}

export function writeUserSettings(s: UserSettings): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(s));
}

export function readModelConfig(call_type: AiCallType): CallTypeConfig | null {
  const raw = localStorage.getItem(KEYS.modelConfig);
  if (!raw) return null;
  return modelConfigMapSchema.assert(JSON.parse(raw))[call_type] ?? null;
}

export function writeModelConfig(call_type: AiCallType, config: CallTypeConfig): void {
  const raw = localStorage.getItem(KEYS.modelConfig);
  const map = raw ? modelConfigMapSchema.assert(JSON.parse(raw)) : {};
  map[call_type] = callTypeConfigSchema.assert(config);
  localStorage.setItem(KEYS.modelConfig, JSON.stringify(map));
}

export function resetModelConfig(): void {
  localStorage.removeItem(KEYS.modelConfig);
}

export function getEffectiveModelConfig(call_type: AiCallType): CallTypeConfig {
  return readModelConfig(call_type) ?? DEFAULT_AI_CONFIG[call_type];
}

export function readDebugMode(): boolean {
  return localStorage.getItem(KEYS.debugMode) === 'true';
}

export function writeDebugMode(on: boolean): void {
  if (on) localStorage.setItem(KEYS.debugMode, 'true');
  else localStorage.removeItem(KEYS.debugMode);
}

export function clearAllSettings(): void {
  for (const k of Object.values(KEYS)) localStorage.removeItem(k);
}
