// localStorage-backed settings. Replaces the server-side users.settings JSONB
// and ai_settings table. Small enough for localStorage; API key fits trivially.
//
// Reads are validated with arktype: malformed JSON or shape drift falls back
// to defaults rather than poisoning the in-memory state with `as` casts.

import { type } from 'arktype';
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

// Parse JSON without throwing. Validation happens via arktype below.
function readJson(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readUserSettings(): UserSettings {
  const parsed = userSettingsSchema(readJson(KEYS.settings));
  if (parsed instanceof type.errors) return DEFAULT_USER_SETTINGS;
  return { ...DEFAULT_USER_SETTINGS, ...parsed };
}

export function writeUserSettings(s: UserSettings): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(s));
}

function readModelConfigMap(): Record<AiCallType, CallTypeConfig | undefined> {
  const parsed = modelConfigMapSchema(readJson(KEYS.modelConfig));
  if (parsed instanceof type.errors) return { detect: undefined, analyze: undefined };
  return { detect: parsed.detect, analyze: parsed.analyze };
}

export function readModelConfig(call_type: AiCallType): CallTypeConfig | null {
  return readModelConfigMap()[call_type] ?? null;
}

export function writeModelConfig(call_type: AiCallType, config: CallTypeConfig): void {
  const validated = callTypeConfigSchema(config);
  if (validated instanceof type.errors) {
    throw new Error(`Invalid CallTypeConfig: ${validated.summary}`);
  }
  const map = readModelConfigMap();
  map[call_type] = validated;
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
