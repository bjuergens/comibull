// Browser-side OCR via Tesseract.js. Replaces the Anthropic Vision detect step:
// runs entirely on-device, costs nothing, and works offline once the language
// data is cached. Trade-off: Tesseract has no concept of "speech bubble vs
// narration vs sfx" — we emit every detected block as type=dialogue and let
// the user re-classify if it matters. The analyze step still uses Anthropic.
//
// One worker per source language, lazily created and reused across calls so we
// only pay the language-data download (≈10–20 MB) once per session per language.

import { createWorker, type Worker } from 'tesseract.js';
import {
  DEFAULT_SOURCE_LANGUAGE,
  type Region,
  type SourceLanguage,
} from './shared-types';

// E2E test seam: when window.__tesseractDetectMock is set, calls bypass
// Tesseract entirely. Avoids the language-data CDN fetch and the slow OCR run
// in headless CI, where the tiny test fixture wouldn't yield text anyway.
declare global {
  interface Window {
    __tesseractDetectMock?: (image: Blob, lang: SourceLanguage) => Promise<Region[]>;
  }
}

// Tesseract trained-data codes — different from our 2-letter SourceLanguage.
// https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html
const TESSERACT_LANG: Record<SourceLanguage, string> = {
  fr: 'fra',
  ja: 'jpn',
};

let workerPromise: Promise<Worker> | null = null;
let workerLang: SourceLanguage | null = null;

async function getWorker(lang: SourceLanguage): Promise<Worker> {
  if (workerLang === lang && workerPromise) return workerPromise;
  if (workerPromise) {
    const old = workerPromise;
    workerPromise = null;
    workerLang = null;
    void old.then(w => w.terminate());
  }
  workerLang = lang;
  workerPromise = createWorker(TESSERACT_LANG[lang]);
  return workerPromise;
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

export async function detectPage(
  image: Blob,
  source_language: SourceLanguage = DEFAULT_SOURCE_LANGUAGE,
): Promise<Region[]> {
  if (typeof window !== 'undefined' && window.__tesseractDetectMock) {
    return window.__tesseractDetectMock(image, source_language);
  }
  const worker = await getWorker(source_language);
  const { width, height } = await imageDimensions(image);
  const { data } = await worker.recognize(image, {}, { blocks: true });
  const blocks = data.blocks ?? [];
  return blocks
    .filter(b => b.text.trim().length > 0)
    .map(b => ({
      bbox: [
        b.bbox.x0 / width,
        b.bbox.y0 / height,
        b.bbox.x1 / width,
        b.bbox.y1 / height,
      ] as [number, number, number, number],
      ocr_text: b.text.trim(),
      type: 'dialogue' as const,
      source: 'tesseract',
    }));
}
