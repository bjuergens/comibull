// Shared HTTP / hashing helpers used by both Anthropic and Google Vision
// clients. Kept tiny on purpose — provider modules still own their own error
// classes and response parsing.

import { type, type Type } from 'arktype';

// 2 minutes — long enough for vision calls on big pages, short enough that a
// hung request fails loudly.
export const REQUEST_TIMEOUT_MS = 120_000;

// Shape of every provider's HTTP error class: status + message constructor.
export type HttpErrorClass = new (status: number, message: string) => Error;

export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function blobToBase64(blob: Blob): Promise<string> {
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

// fetch() with a hard timeout. Each provider passes its own error class so
// the thrown timeout carries the right type for instanceof checks at callsites.
export async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit,
  ErrorClass: HttpErrorClass,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ErrorClass(0, `Anfrage nach ${REQUEST_TIMEOUT_MS / 1000}s abgebrochen (Timeout).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Pull the error message out of a non-OK Response. Each provider has its own
// error JSON shape, so callers pass an arktype schema describing it; the
// fallback "<status> <statusText>" is used if parsing fails.
export async function readErrorMessage<S extends Type>(
  res: Response,
  errorSchema: S,
  pickMessage: (parsed: S['infer']) => string | undefined,
): Promise<string> {
  const fallback = `${res.status} ${res.statusText}`;
  try {
    const parsed = errorSchema(await res.json());
    if (parsed instanceof type.errors) return fallback;
    return pickMessage(parsed) ?? fallback;
  } catch {
    return fallback;
  }
}

