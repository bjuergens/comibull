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

import { type, type Type } from 'arktype';
import {
  ANALYZE_PROMPT,
  bboxSchema,
  cefrLevelSchema,
  DEFAULT_AI_CONFIG,
  DEFAULT_SOURCE_LANGUAGE,
  DETECT_PROMPT,
  LANGUAGE_LABELS,
  regionTypeSchema,
  SYSTEM_PROMPT,
  TARGET_LANGUAGE_NAME,
  type CallTypeConfig,
  type Region,
  type SourceLanguage,
  type AiCallType,
} from './shared-types';
import { cacheStore, logCall } from './store';
import { assertWebpBlob } from './image-conversion';
import { readApiKey, readModelConfig } from './user-settings';
import { detectPageWithGoogleVision } from './google-vision';
import { blobToBase64, fetchWithTimeout, readErrorMessage, sha256Hex, tryCachedResponse } from './api-utils';

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

// Validates the /v1/messages envelope. The model-supplied `input` is left
// untyped here; the per-call schema validates it next.
const anthropicEnvelopeSchema = type({
  content: type({
    type: 'string',
    'text?': 'string',
    'name?': 'string',
    'input?': 'unknown',
  }).array(),
  usage: { input_tokens: 'number.integer', output_tokens: 'number.integer' },
  stop_reason: 'string',
  id: 'string',
});

const anthropicErrorSchema = type({
  'error?': { 'message?': 'string' },
});

interface CallArgs<S extends Type> {
  call_type: AiCallType;
  config: CallTypeConfig;
  system: string;
  prompt: string;
  image?: { media_type: string; data: string };
  schema: S;
  page_id: number | null;
}

// ─── Anthropic structured-output response schemas ───────────────────────
// Defined here (not in shared-types) because anthropic.ts is the only consumer:
// they shape what the model is asked to return and validate what it returns.

export const detectResponseSchema = type({
  regions: type({
    bbox: bboxSchema,
    ocr_text: 'string',
    type: regionTypeSchema,
    '+': 'reject',
  }).array(),
  '+': 'reject',
});

// Analyze returns one entry per region with a region_index pointing back at the
// input order. The rest of each entry matches RegionAnalysis exactly. We re-list
// the fields rather than .merge()'ing because arktype's merge drops the source
// type's '+': 'reject' rule, silently allowing extras.
export const analyzeResponseSchema = type({
  analyses: type({
    region_index: 'number.integer >= 0',
    vocabulary: type({
      source: 'string',
      target: 'string',
      notes: 'string',
      '+': 'reject',
    }).array(),
    grammar_notes: 'string[]',
    translation: 'string',
    difficulty: cefrLevelSchema,
    cultural_notes: 'string',
    '+': 'reject',
  }).array(),
  '+': 'reject',
});

// All structured-output calls go through one tool name. The model returns
// the JSON as the tool_use input — we don't actually run anything.
const STRUCTURED_TOOL_NAME = 'submit_result';

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // Required for direct browser calls. Trade-off is documented in Settings UI.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

const readAnthropicError = (res: Response) =>
  readErrorMessage(res, anthropicErrorSchema, p => p.error?.message);

async function callClaude<S extends Type>(args: CallArgs<S>): Promise<{
  parsed: S['infer'];
  tokens: { input: number; output: number };
  cache_hit: boolean;
}> {
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
    system: args.system,
    messages: [{ role: 'user', content }],
    tools: [{
      name: STRUCTURED_TOOL_NAME,
      description: 'Submit the structured result. This is the only valid action.',
      input_schema: args.schema.toJsonSchema(),
    }],
    tool_choice: { type: 'tool', name: STRUCTURED_TOOL_NAME },
  };

  // Hash input (minus the API key, which lives in headers) for content-addressed
  // caching. Schema is part of `body` (input_schema), so a schema change normally
  // invalidates entries via the hash — `tryCachedResponse` re-validates on hit
  // as a backstop against a stale payload from before a refactor.
  const call_hash = await sha256Hex(JSON.stringify(body));
  const cached = await tryCachedResponse(call_hash, args.schema, hit => ({
    call_type: args.call_type,
    provider: 'anthropic',
    model: args.config.model,
    input_tokens: hit.input_tokens,
    output_tokens: hit.output_tokens,
    cache_hit: true,
    page_id: args.page_id,
    created_at: new Date().toISOString(),
  }));
  if (cached !== null) {
    return { parsed: cached, tokens: { input: 0, output: 0 }, cache_hit: true };
  }

  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify(body),
  }, AnthropicError);

  if (!res.ok) throw new AnthropicError(res.status, await readAnthropicError(res));

  const json = anthropicEnvelopeSchema(await res.json());
  if (json instanceof type.errors) {
    throw new AnthropicError(0, `Antwort hat unerwartete Form: ${json.summary}`);
  }
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
  const parsed = args.schema(toolBlock.input);
  if (parsed instanceof type.errors) {
    throw new AnthropicError(0, `Antwort entspricht nicht dem Schema: ${parsed.summary}`);
  }

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
    provider: 'anthropic',
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

async function detectPageWithAnthropic(
  image: Blob,
  source_language: SourceLanguage,
  page_id: number | null,
): Promise<Region[]> {
  const config = readModelConfig('detect') ?? DEFAULT_AI_CONFIG.detect;
  const langName = LANGUAGE_LABELS[source_language].en;
  assertWebpBlob(image);
  const data = await blobToBase64(image);
  const mediaType = 'image/webp';
  const { parsed } = await callClaude({
    call_type: 'detect',
    config,
    system: SYSTEM_PROMPT(langName),
    prompt: DETECT_PROMPT(langName),
    image: { media_type: mediaType, data },
    schema: detectResponseSchema,
    page_id,
  });
  return parsed.regions.map(r => ({
    bbox: r.bbox,
    ocr_text: r.ocr_text,
    type: r.type,
    source: 'anthropic',
  }));
}

// Dispatcher. Routes to whichever provider the user picked for the detect
// step in Settings. Public signature unchanged from before the multi-provider
// refactor so callers (usePageOperations) don't care.
export async function detectPage(
  image: Blob,
  source_language: SourceLanguage = DEFAULT_SOURCE_LANGUAGE,
  page_id: number | null = null,
): Promise<Region[]> {
  const config = readModelConfig('detect') ?? DEFAULT_AI_CONFIG.detect;
  if (config.provider === 'google') {
    return detectPageWithGoogleVision(image, page_id);
  }
  return detectPageWithAnthropic(image, source_language, page_id);
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
    schema: analyzeResponseSchema,
    page_id,
  });
  return regions.map((r, i) => {
    const a = parsed.analyses.find(x => x.region_index === i);
    if (!a) return r;
    const { region_index: _ri, ...analysis } = a;
    return { ...r, analysis };
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
  }, AnthropicError);
  if (!res.ok) throw new AnthropicError(res.status, await readAnthropicError(res));
}
