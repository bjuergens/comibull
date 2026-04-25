// localStorage-backed settings. Replaces the server-side users.settings JSONB
// and ai_settings table. Small enough for localStorage; API key fits trivially.

import {
  type AiCallType,
  type CallTypeConfig,
  DEFAULT_AI_CONFIG,
  DEFAULT_USER_SETTINGS,
  type UserSettings,
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
  try {
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) as Partial<UserSettings> };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function writeUserSettings(s: UserSettings): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(s));
}

export function readModelConfig(call_type: AiCallType): CallTypeConfig | null {
  const raw = localStorage.getItem(KEYS.modelConfig);
  if (!raw) return null;
  try {
    const all = JSON.parse(raw) as Partial<Record<AiCallType, CallTypeConfig>>;
    return all[call_type] ?? null;
  } catch {
    return null;
  }
}

export function writeModelConfig(call_type: AiCallType, config: CallTypeConfig): void {
  const raw = localStorage.getItem(KEYS.modelConfig);
  let all: Partial<Record<AiCallType, CallTypeConfig>> = {};
  if (raw) {
    try {
      all = JSON.parse(raw) as Partial<Record<AiCallType, CallTypeConfig>>;
    } catch { /* ignore malformed */ }
  }
  all[call_type] = config;
  localStorage.setItem(KEYS.modelConfig, JSON.stringify(all));
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
