import type { Page, Route } from '@playwright/test';

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
  detectRegions?: { bbox: [number, number, number, number]; ocr_text: string; type?: string }[];
  /** Translation string returned for region_index 0. Defaults to "Hallo!". */
  analyzeTranslation?: string;
  /** Override the overall behavior (e.g. to simulate errors). */
  onRequest?: (route: Route, body: unknown) => Promise<void> | void;
}

const DEFAULT_REGIONS = [
  { bbox: [0.1, 0.1, 0.4, 0.3] as [number, number, number, number], ocr_text: 'Bonjour !', type: 'dialogue' },
];

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
      toolInput = {
        regions: detectRegions,
        vision_context: {
          context: 'Test scene.',
          estimated_box_count: detectRegions.length,
          text_density: 'low',
          font_styles: ['handwritten'],
          contrast: 'high',
          box_types: { dialogue: detectRegions.length },
          mood: 'neutral',
          narrative_notes: '',
        },
      };
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
export async function seedApiKey(page: Page, key = 'sk-test-123'): Promise<void> {
  await page.addInitScript((k) => {
    localStorage.setItem('anthropic_api_key', k);
  }, key);
}

// Wipe IndexedDB + localStorage between tests for a clean slate.
export async function resetState(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    const dbs = await indexedDB.databases?.() ?? [];
    for (const { name } of dbs) {
      if (name) await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    }
  });
}
