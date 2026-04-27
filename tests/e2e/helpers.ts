import type { Page, Route } from '@playwright/test';

// Region shape returned by the mocked detect step. Matches the subset used by
// the test fixtures; full Region also has an optional analysis populated later.
type DetectRegionFixture = {
  bbox: [number, number, number, number];
  ocr_text: string;
  type?: string;
};

// 1x1 white PNG — valid image bytes, tiny on disk, good enough for <input type=file>.
export const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

export const TEST_PNG_BUFFER = Buffer.from(TEST_PNG_BASE64, 'base64');

// ── Anthropic API mock ────────────────────────────────────────────────────
// One route handler intercepts every POST to /v1/messages and switches on the
// tool name in the request body (detect vs analyze vs the Settings probe).
// Keeps the tests focused on UI behavior; no real tokens spent.

interface MockOptions {
  /** Regions the detect call should report. Defaults to one dialogue bubble. */
  detectRegions?: DetectRegionFixture[];
  /** Translation string returned for region_index 0. Defaults to "Hallo!". */
  analyzeTranslation?: string;
  /** Override the overall behavior (e.g. to simulate errors). */
  onRequest?: (route: Route, body: unknown) => Promise<void> | void;
}

const DEFAULT_REGIONS: DetectRegionFixture[] = [
  { bbox: [0.1, 0.1, 0.4, 0.3], ocr_text: 'Bonjour !', type: 'dialogue' },
];

// Stub the Tesseract.js detect step. Skips the CDN language-data fetch and
// the OCR run, which would yield zero regions on the 1x1 test fixture anyway.
// See src/tesseract.ts for the matching `__tesseractDetectMock` seam.
//
// Same shape as seedApiKey: addInitScript for post-reload, evaluate for the
// already-loaded page (HashRouter never triggers a real navigation after the
// initial goto in resetState).
export async function mockTesseract(
  page: Page,
  regions: DetectRegionFixture[] = DEFAULT_REGIONS,
): Promise<void> {
  const install = (rs: DetectRegionFixture[]) => {
    (window as unknown as { __tesseractDetectMock: unknown }).__tesseractDetectMock =
      async () => rs.map(r => ({
        bbox: r.bbox,
        ocr_text: r.ocr_text,
        type: r.type,
        source: 'tesseract',
      }));
  };
  await page.addInitScript(install, regions);
  await page.evaluate(install, regions);
}

export async function mockAnthropic(page: Page, opts: MockOptions = {}): Promise<void> {
  const detectRegions = opts.detectRegions ?? DEFAULT_REGIONS;
  const analyzeTranslation = opts.analyzeTranslation ?? 'Hallo!';

  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (opts.onRequest) {
      await opts.onRequest(route, body);
      return;
    }

    const b = body as {
      tools?: { name: string }[];
      tool_choice?: { name?: string };
      messages?: { content: unknown }[];
    };

    const toolName = b.tool_choice?.name ?? b.tools?.[0]?.name;

    // Probe call from Settings' "test API key" button — no tool, plain text reply.
    if (!toolName) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'msg_probe',
          content: [{ type: 'text', text: 'OK' }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: 'end_turn',
        }),
      });
      return;
    }

    // Detect vs analyze: distinguish by whether the user message has an image.
    const firstMsg = b.messages?.[0];
    const content = Array.isArray(firstMsg?.content) ? firstMsg.content : [];
    const hasImage = content.some((c: unknown) =>
      typeof c === 'object' && c !== null && (c as { type?: string }).type === 'image',
    );

    let toolInput: unknown;
    if (hasImage) {
      toolInput = { regions: detectRegions };
    } else {
      toolInput = {
        analyses: detectRegions.map((_, i) => ({
          region_index: i,
          vocabulary: [],
          grammar_notes: [],
          difficulty: 'A1',
          cultural_notes: '',
          translation: analyzeTranslation,
        })),
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'msg_mock',
        content: [{ type: 'tool_use', name: toolName, input: toolInput }],
        usage: { input_tokens: 10, output_tokens: 10 },
        stop_reason: 'tool_use',
      }),
    });
  });
}

// Seed the API key into localStorage so tests can skip the Settings dance.
// addInitScript covers post-reload state; evaluate covers the already-loaded
// page (the test never does a full reload between resetState and the first
// action under HashRouter, so addInitScript alone wouldn't fire).
export async function seedApiKey(page: Page, key = 'sk-test-123'): Promise<void> {
  await page.addInitScript((k) => {
    localStorage.setItem('anthropic_api_key', k);
  }, key);
  await page.evaluate((k) => {
    localStorage.setItem('anthropic_api_key', k);
  }, key);
}

// Wipe IndexedDB + localStorage between tests for a clean slate.
// We clear the existing object stores rather than deleteDatabase: the React
// app mounted by `page.goto('/')` holds an open connection, which blocks
// deleteDatabase indefinitely. The blocked request would then fire later,
// when page.reload() finally closes the connection — wiping data mid-test.
export async function resetState(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('comibull');
      req.onerror = () => resolve();
      req.onsuccess = () => {
        const db = req.result;
        const stores = Array.from(db.objectStoreNames);
        if (stores.length === 0) { db.close(); resolve(); return; }
        const tx = db.transaction(stores, 'readwrite');
        for (const s of stores) tx.objectStore(s).clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
    });
  });
}
