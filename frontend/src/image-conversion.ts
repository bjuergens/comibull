// WebP is the canonical format for stored page images. Conversion happens at
// upload time at user-configurable quality; everything downstream assumes WebP
// and asserts on the consumption side so a stray non-WebP blob fails loudly.

const WEBP_MIME = 'image/webp';

export async function toWebp(blob: Blob, quality: number): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('failed to get 2D canvas context');
    ctx.drawImage(img, 0, 0);
    return await canvasToWebp(canvas, quality / 100);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function assertWebpBlob(blob: Blob): void {
  if (blob.type !== WEBP_MIME) {
    throw new Error(`expected image/webp blob, got "${blob.type}"`);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to decode image'));
    img.src = src;
  });
}

export function canvasToWebp(canvas: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('canvas.toBlob returned null for image/webp'));
      },
      WEBP_MIME,
      q,
    );
  });
}
