// Browser-side Google Cloud Vision client. User brings their own API key
// (stored in localStorage). Used as an alternative to the Anthropic vision
// path for the detect step — same Region[] output, different provider.
//
// Auth: API key as ?key=… query param. Google supports browser CORS for
// API-key auth as long as the key isn't HTTP-referrer-restricted (the
// Settings UI warns about this).
// https://cloud.google.com/vision/docs/ocr

import { type } from 'arktype';
import {
  GOOGLE_VISION_MODEL_ID,
  type Region,
} from './shared-types';
import { cacheLookup, cacheStore, logCall } from './store';
import { assertWebpBlob } from './image-conversion';
import { readGoogleApiKey } from './user-settings';

export class GoogleVisionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class MissingGoogleApiKeyError extends Error {
  constructor() {
    super('Google API key not set — add it in Einstellungen.');
  }
}

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
  let bin = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fetchWithTimeout(input: RequestInfo, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new GoogleVisionError(0, `Anfrage nach ${REQUEST_TIMEOUT_MS / 1000}s abgebrochen (Timeout).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const googleErrorSchema = type({
  'error?': { 'message?': 'string', 'code?': 'number' },
});

async function readErrorMessage(res: Response): Promise<string> {
  const fallback = `${res.status} ${res.statusText}`;
  try {
    const parsed = googleErrorSchema(await res.json());
    if (parsed instanceof type.errors) return fallback;
    return parsed.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

// ─── Vision response schema ───────────────────────────────────────────────
// Validates only the fields we read. Vision returns a lot more (locale,
// confidences, language hints, etc.) — those are tolerated via no '+': 'reject'.

const vertexSchema = type({ 'x?': 'number', 'y?': 'number' });

const detectedBreakSchema = type({
  'type?': "'UNKNOWN' | 'SPACE' | 'SURE_SPACE' | 'EOL_SURE_SPACE' | 'LINE_BREAK' | 'HYPHEN'",
});

const symbolSchema = type({
  text: 'string',
  'property?': type({
    'detectedBreak?': detectedBreakSchema,
  }),
});

const wordSchema = type({
  'symbols?': symbolSchema.array(),
});

const paragraphSchema = type({
  'words?': wordSchema.array(),
  'boundingBox?': type({
    'vertices?': vertexSchema.array(),
  }),
});

const blockSchema = type({
  'paragraphs?': paragraphSchema.array(),
});

const pageSchema = type({
  'blocks?': blockSchema.array(),
});

const fullTextAnnotationSchema = type({
  'pages?': pageSchema.array(),
});

const annotateResponseSchema = type({
  'responses?': type({
    'fullTextAnnotation?': fullTextAnnotationSchema,
    'error?': type({ 'message?': 'string', 'code?': 'number' }),
  }).array(),
});

export type GoogleVisionAnnotateResponse = typeof annotateResponseSchema.infer;

// ─── Region mapping ────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function paragraphToText(para: typeof paragraphSchema.infer): string {
  let out = '';
  for (const word of para.words ?? []) {
    for (const sym of word.symbols ?? []) {
      out += sym.text;
      const brk = sym.property?.detectedBreak?.type;
      if (brk === 'SPACE' || brk === 'SURE_SPACE' || brk === 'EOL_SURE_SPACE') {
        out += ' ';
      } else if (brk === 'LINE_BREAK' || brk === 'HYPHEN') {
        out += '\n';
      }
    }
  }
  return out;
}

export function mapVisionResponseToRegions(
  resp: GoogleVisionAnnotateResponse,
  imageW: number,
  imageH: number,
): Region[] {
  const out: Region[] = [];
  const fta = resp.responses?.[0]?.fullTextAnnotation;
  if (!fta) return out;
  for (const page of fta.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        const text = paragraphToText(para).trim();
        if (!text) continue;
        const verts = para.boundingBox?.vertices ?? [];
        if (verts.length < 2) continue;
        const xs = verts.map(v => v.x ?? 0);
        const ys = verts.map(v => v.y ?? 0);
        out.push({
          bbox: [
            clamp01(Math.min(...xs) / imageW),
            clamp01(Math.min(...ys) / imageH),
            clamp01(Math.max(...xs) / imageW),
            clamp01(Math.max(...ys) / imageH),
          ],
          ocr_text: text,
          // Vision can't classify dialogue/narration/sfx — keep neutral.
          type: 'other',
          source: 'google',
        });
      }
    }
  }
  return out;
}

// ─── Image dimensions ──────────────────────────────────────────────────────
// Vision returns absolute pixel coordinates; we need normalized 0–1 for
// bboxSchema. Decoding via createImageBitmap is the cheapest path that works
// in all evergreen browsers and doesn't require a DOM <img>.

async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  try {
    return { width: bmp.width, height: bmp.height };
  } finally {
    bmp.close?.();
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function detectPageWithGoogleVision(
  image: Blob,
  page_id: number | null = null,
): Promise<Region[]> {
  const apiKey = readGoogleApiKey();
  if (!apiKey) throw new MissingGoogleApiKeyError();

  assertWebpBlob(image);
  const data = await blobToBase64(image);

  const body = {
    requests: [{
      image: { content: data },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
    }],
  };

  // Same content-addressed cache as the Anthropic path. Body shape differs
  // structurally so SHA256 collisions with Anthropic entries are impossible.
  const call_hash = await sha256Hex(JSON.stringify(body));
  const hit = await cacheLookup(call_hash);
  if (hit) {
    await logCall({
      call_type: 'detect',
      provider: 'google',
      model: GOOGLE_VISION_MODEL_ID,
      input_tokens: hit.input_tokens,
      output_tokens: hit.output_tokens,
      cache_hit: true,
      page_id,
      created_at: new Date().toISOString(),
    });
    // Cached response is already a Region[] — we cache the mapped output, not
    // the raw Vision envelope, because the mapping is deterministic and the
    // mapping needs image dimensions which we don't want to re-decode.
    return hit.response_json as Region[];
  }

  const { width, height } = await readImageDimensions(image);

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new GoogleVisionError(res.status, await readErrorMessage(res));

  const json = annotateResponseSchema(await res.json());
  if (json instanceof type.errors) {
    throw new GoogleVisionError(0, `Antwort hat unerwartete Form: ${json.summary}`);
  }
  // Vision wraps per-request errors inside responses[i].error rather than
  // returning a non-200. Surface them like an HTTP error.
  const perReqErr = json.responses?.[0]?.error;
  if (perReqErr?.message) {
    throw new GoogleVisionError(perReqErr.code ?? 0, perReqErr.message);
  }

  const regions = mapVisionResponseToRegions(json, width, height);

  // Vision charges per call, not per token. Store 0/0 to keep schemas simple;
  // the call log filters on cache_hit for "spent vs saved" so this is consistent.
  await cacheStore({
    call_hash,
    call_type: 'detect',
    response_json: regions,
    input_tokens: 0,
    output_tokens: 0,
    created_at: new Date().toISOString(),
  });
  await logCall({
    call_type: 'detect',
    provider: 'google',
    model: GOOGLE_VISION_MODEL_ID,
    input_tokens: 0,
    output_tokens: 0,
    cache_hit: false,
    page_id,
    created_at: new Date().toISOString(),
  });

  return regions;
}

// 1×1 transparent PNG, base64. Used by testGoogleApiKey for a minimal probe.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export async function testGoogleApiKey(apiKey: string): Promise<void> {
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: TINY_PNG_B64 },
        features: [{ type: 'LABEL_DETECTION', maxResults: 1 }],
      }],
    }),
  });
  if (!res.ok) throw new GoogleVisionError(res.status, await readErrorMessage(res));
  // A 200 with a per-request error still indicates a bad key/permissions.
  const parsed = annotateResponseSchema(await res.json());
  if (!(parsed instanceof type.errors)) {
    const perReqErr = parsed.responses?.[0]?.error;
    if (perReqErr?.message) {
      throw new GoogleVisionError(perReqErr.code ?? 0, perReqErr.message);
    }
  }
}
