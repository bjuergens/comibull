// Browser-side Anthropic client. User brings their own API key (stored in
// localStorage, read here on each call so key rotation takes effect instantly).
// We use fetch() instead of @anthropic-ai/sdk to keep the bundle small — the
// /v1/messages API is a single HTTPS POST.
//
// Structured outputs: we use the documented `tools` + `tool_choice` pattern
// rather than a beta `output_config` parameter. Defining a single tool whose
// input_schema is the desired shape, then forcing tool_choice to it, makes
// Claude return exactly that JSON in a tool_use block. This is universally
// supported and doesn't depend on any preview API surface.
// https://docs.anthropic.com/en/docs/agents-and-tools/tool-use

import {
  ANALYZE_PROMPT,
  ANALYZE_SCHEMA,
  DEFAULT_AI_CONFIG,
  DEFAULT_SOURCE_LANGUAGE,
  DETECT_PROMPT,
  DETECT_SCHEMA,
  LANGUAGE_LABELS,
  type RegionAnalysis,
  type SourceLanguage,
  SYSTEM_PROMPT,
  TARGET_LANGUAGE_NAME,
  type Bbox,
  type CallTypeConfig,
  type Region,
  type AiCallType,
} from './shared-types';
import { cacheLookup, cacheStore, logCall } from './store';
import { readApiKey, readModelConfig } from './user-settings';

export class AnthropicError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('Anthropic API key not set — add it in Einstellungen.');
  }
}

// 2 minutes — the backend's anthropic_timeout_s default. Long enough for
// vision calls on big pages, short enough that a hung request fails loudly.
const REQUEST_TIMEOUT_MS = 120_000;

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  // btoa needs a binary string. Chunked spread avoids the
  // String.fromCharCode(...big) stack-overflow trap on large images.
  let bin = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

interface AnthropicResponse {
  content: { type: string; text?: string; name?: string; input?: unknown }[];
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
  id: string;
}

interface CallArgs {
  call_type: AiCallType;
  config: CallTypeConfig;
  system: string;
  prompt: string;
  image?: { media_type: string; data: string };
  schema: unknown;
  page_id: number | null;
}

// All structured-output calls go through one tool name. The model returns
// the JSON as the tool_use input — we don't actually run anything.
const STRUCTURED_TOOL_NAME = 'submit_result';

async function fetchWithTimeout(input: RequestInfo, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AnthropicError(0, `Anfrage nach ${REQUEST_TIMEOUT_MS / 1000}s abgebrochen (Timeout).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // Required for direct browser calls. Trade-off is documented in Settings UI.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

async function readErrorMessage(res: Response): Promise<string> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const err = await res.json() as { error?: { message?: string } };
    if (err.error?.message) message = err.error.message;
  } catch { /* not JSON */ }
  return message;
}

async function callClaude(args: CallArgs): Promise<{ parsed: unknown; tokens: { input: number; output: number }; cache_hit: boolean }> {
  const apiKey = readApiKey();
  if (!apiKey) throw new MissingApiKeyError();

  const content: unknown[] = [];
  if (args.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: args.image.media_type, data: args.image.data },
    });
  }
  content.push({ type: 'text', text: args.prompt });

  const body = {
    model: args.config.model,
    max_tokens: args.config.max_tokens,
    temperature: args.config.temperature,
    system: args.system,
    messages: [{ role: 'user', content }],
    tools: [{
      name: STRUCTURED_TOOL_NAME,
      description: 'Submit the structured result. This is the only valid action.',
      input_schema: args.schema,
    }],
    tool_choice: { type: 'tool', name: STRUCTURED_TOOL_NAME },
  };

  // Hash input (minus the API key, which lives in headers) for content-addressed caching.
  const call_hash = await sha256Hex(JSON.stringify(body));
  const hit = await cacheLookup(call_hash);
  if (hit) {
    await logCall({
      call_type: args.call_type,
      model: args.config.model,
      input_tokens: 0,
      output_tokens: 0,
      cache_hit: true,
      page_id: args.page_id,
      created_at: new Date().toISOString(),
    });
    return { parsed: hit.response_json, tokens: { input: 0, output: 0 }, cache_hit: true };
  }

  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new AnthropicError(res.status, await readErrorMessage(res));

  const json = await res.json() as AnthropicResponse;
  // tool_use is the expected stop reason when tool_choice forces a tool.
  // Anything else (max_tokens, refusal, end_turn-without-tool) means the
  // model didn't comply — fail loud rather than try to recover.
  if (json.stop_reason !== 'tool_use') {
    throw new AnthropicError(
      0,
      `Antwort hat unerwartetes stop_reason="${json.stop_reason}". max_tokens erhöhen oder Eingabe kürzen.`,
    );
  }

  const toolBlock = json.content.find(b => b.type === 'tool_use' && b.name === STRUCTURED_TOOL_NAME);
  if (!toolBlock || toolBlock.input === undefined) {
    throw new AnthropicError(0, 'Keine tool_use-Antwort erhalten.');
  }
  const parsed = toolBlock.input;

  const tokens = { input: json.usage.input_tokens, output: json.usage.output_tokens };
  await cacheStore({
    call_hash,
    call_type: args.call_type,
    response_json: parsed,
    input_tokens: tokens.input,
    output_tokens: tokens.output,
    created_at: new Date().toISOString(),
  });
  await logCall({
    call_type: args.call_type,
    model: args.config.model,
    input_tokens: tokens.input,
    output_tokens: tokens.output,
    cache_hit: false,
    page_id: args.page_id,
    created_at: new Date().toISOString(),
  });
  return { parsed, tokens, cache_hit: false };
}

// ─── Public API ──────────────────────────────────────────────────────────

export async function detectPage(
  image: Blob,
  source_language: SourceLanguage = DEFAULT_SOURCE_LANGUAGE,
  page_id: number | null = null,
): Promise<Region[]> {
  const config = readModelConfig('detect') ?? DEFAULT_AI_CONFIG.detect;
  const langName = LANGUAGE_LABELS[source_language].en;
  const data = await blobToBase64(image);
  const mediaType = image.type || 'image/png';
  const { parsed } = await callClaude({
    call_type: 'detect',
    config,
    system: SYSTEM_PROMPT(langName),
    prompt: DETECT_PROMPT(langName),
    image: { media_type: mediaType, data },
    schema: DETECT_SCHEMA,
    page_id,
  });
  // The schema enforces bbox: [n,n,n,n] and type ∈ {dialogue,narration,sfx,other}.
  // If Claude violated the schema we'd have thrown upstream — trust the shape here.
  const out = parsed as {
    regions: { bbox: [number, number, number, number]; ocr_text: string; type: Region['type'] }[];
  };
  return out.regions.map(r => ({
    bbox: r.bbox as Bbox,
    ocr_text: r.ocr_text,
    type: r.type,
    source: 'anthropic',
  }));
}

export async function analyzeRegions(
  regions: Region[],
  source_language: SourceLanguage = DEFAULT_SOURCE_LANGUAGE,
  page_id: number | null = null,
): Promise<Region[]> {
  if (regions.length === 0) return [];
  const config = readModelConfig('analyze') ?? DEFAULT_AI_CONFIG.analyze;
  const langName = LANGUAGE_LABELS[source_language].en;
  const payload = regions.map((r, i) => ({
    index: i,
    type: r.type ?? 'other',
    ocr_text: r.ocr_text ?? '',
  }));
  const { parsed } = await callClaude({
    call_type: 'analyze',
    config,
    system: SYSTEM_PROMPT(langName),
    prompt: ANALYZE_PROMPT(langName, TARGET_LANGUAGE_NAME, JSON.stringify(payload, null, 2)),
    schema: ANALYZE_SCHEMA,
    page_id,
  });
  const out = parsed as { analyses: (RegionAnalysis & { region_index: number })[] };
  return regions.map((r, i) => {
    const a = out.analyses.find(x => x.region_index === i);
    if (!a) return r;
    const { region_index: _ri, ...analysis } = a;
    return { ...r, analysis: analysis as RegionAnalysis };
  });
}

// Simple "does the key work?" probe used by Settings.
export async function testApiKey(apiKey: string): Promise<void> {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'reply with the single word OK' }],
    }),
  });
  if (!res.ok) throw new AnthropicError(res.status, await readErrorMessage(res));
}
