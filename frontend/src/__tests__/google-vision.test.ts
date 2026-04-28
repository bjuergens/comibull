import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cacheLookup: vi.fn(),
  cacheStore: vi.fn(),
  logCall: vi.fn(),
  readGoogleApiKey: vi.fn(),
  readUserSettings: vi.fn(),
}));

vi.mock('../store', () => ({
  cacheLookup: mocks.cacheLookup,
  cacheStore: mocks.cacheStore,
  logCall: mocks.logCall,
}));

vi.mock('../user-settings', () => ({
  readGoogleApiKey: mocks.readGoogleApiKey,
  readUserSettings: mocks.readUserSettings,
}));

// detectPageWithGoogleVision needs to decode image dimensions and to skip
// the WebP assertion. Stub both at the module boundary.
vi.mock('../image-conversion', () => ({
  assertWebpBlob: vi.fn(),
}));

import {
  detectPageWithGoogleVision,
  mapVisionResponseToRegions,
  mergeCloseRegions,
  type GoogleVisionAnnotateResponse,
} from '../google-vision';
import type { Region } from '../shared-types';

// A minimal Vision response covering bbox normalization, paragraph text
// concatenation with break types, and an empty paragraph.
const VISION_RESPONSE: GoogleVisionAnnotateResponse = {
  responses: [{
    fullTextAnnotation: {
      pages: [{
        blocks: [{
          paragraphs: [
            {
              boundingBox: {
                vertices: [
                  { x: 10, y: 20 },
                  { x: 110, y: 20 },
                  { x: 110, y: 60 },
                  { x: 10, y: 60 },
                ],
              },
              words: [
                {
                  symbols: [
                    { text: 'H' },
                    { text: 'i', property: { detectedBreak: { type: 'SPACE' } } },
                    { text: 't', property: { detectedBreak: { type: 'LINE_BREAK' } } },
                    { text: 'h', property: { detectedBreak: { type: 'SURE_SPACE' } } },
                    { text: 'x' },
                  ],
                },
              ],
            },
            {
              // Empty paragraph — should be skipped.
              boundingBox: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
              words: [{ symbols: [{ text: '   ' }] }],
            },
          ],
        }],
      }],
    },
  }],
};

describe('mapVisionResponseToRegions', () => {
  it('normalizes bbox coordinates and concatenates paragraph text', () => {
    const regions = mapVisionResponseToRegions(VISION_RESPONSE, 200, 100);
    expect(regions).toHaveLength(1);
    const r = regions[0]!;
    expect(r.bbox).toEqual([10 / 200, 20 / 100, 110 / 200, 60 / 100]);
    expect(r.ocr_text).toBe('Hi t\nh x');
    expect(r.type).toBe('other');
    expect(r.source).toBe('google');
  });

  it('clamps out-of-bounds vertices to [0,1]', () => {
    const resp: GoogleVisionAnnotateResponse = {
      responses: [{
        fullTextAnnotation: {
          pages: [{
            blocks: [{
              paragraphs: [{
                boundingBox: {
                  vertices: [
                    { x: -5, y: -5 },
                    { x: 250, y: 250 },
                  ],
                },
                words: [{ symbols: [{ text: 'A' }] }],
              }],
            }],
          }],
        },
      }],
    };
    const regions = mapVisionResponseToRegions(resp, 200, 100);
    expect(regions[0]?.bbox).toEqual([0, 0, 1, 1]);
  });

  it('returns [] for empty / missing fullTextAnnotation', () => {
    expect(mapVisionResponseToRegions({ responses: [{}] }, 100, 100)).toEqual([]);
    expect(mapVisionResponseToRegions({}, 100, 100)).toEqual([]);
  });

  it("granularity='blocks': emits one region per block, joining its paragraphs", () => {
    const resp: GoogleVisionAnnotateResponse = {
      responses: [{
        fullTextAnnotation: {
          pages: [{
            blocks: [{
              boundingBox: {
                vertices: [
                  { x: 10, y: 10 },
                  { x: 100, y: 10 },
                  { x: 100, y: 80 },
                  { x: 10, y: 80 },
                ],
              },
              paragraphs: [
                {
                  boundingBox: { vertices: [{ x: 10, y: 10 }, { x: 100, y: 30 }] },
                  words: [{ symbols: [{ text: 'A' }] }],
                },
                {
                  boundingBox: { vertices: [{ x: 10, y: 50 }, { x: 100, y: 80 }] },
                  words: [{ symbols: [{ text: 'B' }] }],
                },
              ],
            }],
          }],
        },
      }],
    };
    const regions = mapVisionResponseToRegions(resp, 200, 100, 'blocks');
    expect(regions).toHaveLength(1);
    expect(regions[0]?.bbox).toEqual([10 / 200, 10 / 100, 100 / 200, 80 / 100]);
    expect(regions[0]?.ocr_text).toBe('A\nB');
  });

  it('skips non-text blocks (PICTURE, RULER, BARCODE)', () => {
    const resp: GoogleVisionAnnotateResponse = {
      responses: [{
        fullTextAnnotation: {
          pages: [{
            blocks: [{
              blockType: 'PICTURE',
              boundingBox: { vertices: [{ x: 0, y: 0 }, { x: 50, y: 50 }] },
              paragraphs: [{
                boundingBox: { vertices: [{ x: 0, y: 0 }, { x: 50, y: 50 }] },
                words: [{ symbols: [{ text: 'noise' }] }],
              }],
            }],
          }],
        },
      }],
    };
    expect(mapVisionResponseToRegions(resp, 100, 100, 'paragraphs')).toEqual([]);
    expect(mapVisionResponseToRegions(resp, 100, 100, 'blocks')).toEqual([]);
  });
});

describe('mergeCloseRegions', () => {
  function r(bbox: [number, number, number, number], text: string): Region {
    return { bbox, ocr_text: text, type: 'other', source: 'google' };
  }

  it('merges two vertically-close, horizontally-aligned regions', () => {
    // Two stacked lines inside the same speech bubble.
    // Heights: 0.05 each → avgH = 0.05, vGapThreshold = 0.025.
    // Vertical gap = 0.16 - 0.15 = 0.01 < 0.025 ✓
    // Both bboxes fully overlap horizontally ✓
    const merged = mergeCloseRegions([
      r([0.10, 0.10, 0.40, 0.15], 'first line'),
      r([0.10, 0.16, 0.40, 0.21], 'second line'),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.ocr_text).toBe('first line\nsecond line');
    expect(merged[0]?.bbox).toEqual([0.10, 0.10, 0.40, 0.21]);
  });

  it('does NOT merge regions with too large a vertical gap', () => {
    // avgH = 0.05, threshold = 0.025. Gap = 0.50 - 0.15 = 0.35.
    const out = mergeCloseRegions([
      r([0.10, 0.10, 0.40, 0.15], 'top'),
      r([0.10, 0.50, 0.40, 0.55], 'bottom'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('does NOT merge side-by-side regions with low x-overlap', () => {
    // Vertically adjacent but horizontally disjoint (different bubbles).
    const out = mergeCloseRegions([
      r([0.10, 0.10, 0.30, 0.15], 'left'),
      r([0.60, 0.16, 0.80, 0.21], 'right'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('cascades: three close regions all merge into one', () => {
    // avgH = 0.05, threshold = 0.025. All gaps small, full x-overlap.
    const out = mergeCloseRegions([
      r([0.10, 0.10, 0.40, 0.15], 'one'),
      r([0.10, 0.16, 0.40, 0.21], 'two'),
      r([0.10, 0.22, 0.40, 0.27], 'three'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.ocr_text).toBe('one\ntwo\nthree');
    expect(out[0]?.bbox).toEqual([0.10, 0.10, 0.40, 0.27]);
  });

  it('passes through empty / single inputs unchanged', () => {
    expect(mergeCloseRegions([])).toEqual([]);
    const single = [r([0, 0, 0.1, 0.1], 'x')];
    expect(mergeCloseRegions(single)).toEqual(single);
  });
});

describe('detectPageWithGoogleVision', () => {
  beforeEach(() => {
    mocks.cacheLookup.mockReset();
    mocks.cacheStore.mockReset();
    mocks.logCall.mockReset();
    mocks.readGoogleApiKey.mockReset();
    mocks.readUserSettings.mockReset();
    mocks.readGoogleApiKey.mockReturnValue('AIzaTest');
    mocks.readUserSettings.mockReturnValue({
      canEditTextboxes: false,
      defaultLanguage: 'fr',
      webpQuality: 50,
      googleVisionGranularity: 'paragraphs',
      googleVisionMergeCloseBoxes: false,
    });

    vi.stubGlobal('fetch', vi.fn());
    // createImageBitmap doesn't exist in jsdom — provide a stub.
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 200,
      height: 100,
      close: () => undefined,
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The actual blob bytes don't matter — we mock createImageBitmap and
  // assertWebpBlob is stubbed. arrayBuffer needs to return *something*.
  function fakeBlob(): Blob {
    return new Blob([new Uint8Array([0])], { type: 'image/webp' });
  }

  it('cache miss: hits the API, caches the mapped regions, logs the call', async () => {
    mocks.cacheLookup.mockResolvedValue(undefined);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(VISION_RESPONSE), { status: 200 }),
    );

    const regions = await detectPageWithGoogleVision(fakeBlob(), 42);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const fetchUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(String(fetchUrl)).toContain('vision.googleapis.com');
    expect(String(fetchUrl)).toContain('key=AIzaTest');

    expect(regions).toHaveLength(1);
    expect(regions[0]?.source).toBe('google');

    expect(mocks.cacheStore).toHaveBeenCalledTimes(1);
    expect(mocks.logCall).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      cache_hit: false,
      input_tokens: 0,
      output_tokens: 0,
      page_id: 42,
    }));
  });

  it('cache hit: skips the API and logs as savings', async () => {
    const cached = [{ bbox: [0, 0, 1, 1] as [number, number, number, number], ocr_text: 'cached', type: 'other' as const, source: 'google' }];
    mocks.cacheLookup.mockResolvedValue({
      call_hash: 'h',
      call_type: 'detect',
      response_json: cached,
      input_tokens: 0,
      output_tokens: 0,
      created_at: '2026-04-24T00:00:00Z',
    });

    const regions = await detectPageWithGoogleVision(fakeBlob(), null);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.cacheStore).not.toHaveBeenCalled();
    expect(regions).toEqual(cached);
    expect(mocks.logCall).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      cache_hit: true,
    }));
  });

  it('throws MissingGoogleApiKeyError when no key is set', async () => {
    mocks.readGoogleApiKey.mockReturnValue(null);
    await expect(detectPageWithGoogleVision(fakeBlob())).rejects.toThrow(/Google API key not set/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('surfaces HTTP errors with the server-supplied message', async () => {
    mocks.cacheLookup.mockResolvedValue(undefined);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'API_KEY_INVALID' } }), { status: 400 }),
    );
    await expect(detectPageWithGoogleVision(fakeBlob())).rejects.toThrow('API_KEY_INVALID');
    expect(mocks.cacheStore).not.toHaveBeenCalled();
  });

  it('surfaces per-request errors hidden inside a 200 response', async () => {
    mocks.cacheLookup.mockResolvedValue(undefined);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({
        responses: [{ error: { code: 7, message: 'PERMISSION_DENIED' } }],
      }), { status: 200 }),
    );
    await expect(detectPageWithGoogleVision(fakeBlob())).rejects.toThrow('PERMISSION_DENIED');
    expect(mocks.cacheStore).not.toHaveBeenCalled();
  });
});
