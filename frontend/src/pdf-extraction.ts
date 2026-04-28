// One-PDF-per-comic ingestion. Extracts each page as a WebP blob ready for the
// existing addPages() pipeline — same downstream invariants as image uploads.
//
// pdfjs-dist runs its rendering in a Web Worker; we point workerSrc at the
// bundled .mjs via Vite's `?url` import so the worker file is served from the
// same origin as the app (no CDN, no CORS).
//
// Upstream: https://github.com/mozilla/pdf.js
// Render API: pdf.getPage(i).render({ canvasContext, canvas, viewport })

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { canvasToWebp } from './image-conversion';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const PDF_MIME = 'application/pdf';

export function isPdfFile(file: File): boolean {
  return file.type === PDF_MIME || file.name.toLowerCase().endsWith('.pdf');
}

// Renders every page of the PDF to a WebP blob. `scale` is pdfjs's viewport
// scale (1.0 = 72dpi, native PDF units). `quality` is 1–100 webp quality, same
// scale as toWebp() / settings.webpQuality.
export async function extractPdfPages(
  file: File | Blob,
  scale: number,
  quality: number,
): Promise<Blob[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  try {
    const blobs: Blob[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      try {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('failed to get 2D canvas context');
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        blobs.push(await canvasToWebp(canvas, quality / 100));
      } finally {
        page.cleanup();
      }
    }
    return blobs;
  } finally {
    await pdf.destroy();
  }
}
