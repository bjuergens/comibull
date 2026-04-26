import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock store + user-settings before importing the module under test.
// vi.hoisted runs before all imports, so the references are stable.
const mocks = vi.hoisted(() => ({
  cacheLookup: vi.fn(),
  cacheStore: vi.fn(),
  logCall: vi.fn(),
  readApiKey: vi.fn(),
  readModelConfig: vi.fn(),
}));

vi.mock('../store', () => ({
  cacheLookup: mocks.cacheLookup,
  cacheStore: mocks.cacheStore,
  logCall: mocks.logCall,
}));

vi.mock('../user-settings', () => ({
  readApiKey: mocks.readApiKey,
  readModelConfig: mocks.readModelConfig,
}));

import { analyzeRegions } from '../anthropic';
import type { Region } from '../shared-types';

const ANALYZE_RESPONSE = {
  content: [
    {
      type: 'tool_use',
      name: 'submit_result',
      input: {
        analyses: [
          {
            region_index: 0,
            vocabulary: [],
            grammar_notes: [],
            difficulty: 'A1',
            cultural_notes: '',
            translation: 'hello',
          },
        ],
      },
    },
  ],
  usage: { input_tokens: 12, output_tokens: 34 },
  stop_reason: 'tool_use',
  id: 'msg_123',
};

describe('anthropic.ts caching', () => {
  beforeEach(() => {
    mocks.cacheLookup.mockReset();
    mocks.cacheStore.mockReset();
    mocks.logCall.mockReset();
    mocks.readApiKey.mockReset();
    mocks.readModelConfig.mockReset();

    mocks.readApiKey.mockReturnValue('sk-test');
    mocks.readModelConfig.mockReturnValue({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
    });

    // Each test installs its own fetch behavior.
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sampleRegion: Region = {
    bbox: [0, 0, 0.1, 0.1],
    source: 'anthropic',
    type: 'dialogue',
    ocr_text: 'bonjour',
  };

  it('cache miss: hits the API, then stores + logs the response', async () => {
    mocks.cacheLookup.mockResolvedValue(undefined);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(ANALYZE_RESPONSE), { status: 200 }),
    );

    const out = await analyzeRegions([sampleRegion], 'fr');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.cacheStore).toHaveBeenCalledTimes(1);
    expect(mocks.logCall).toHaveBeenCalledWith(expect.objectContaining({
      cache_hit: false,
      input_tokens: 12,
      output_tokens: 34,
    }));
    expect(out[0]?.analysis?.translation).toBe('hello');
  });

  it('cache hit: skips the API and logs the saved tokens', async () => {
    mocks.cacheLookup.mockResolvedValue({
      call_hash: 'whatever',
      call_type: 'analyze',
      response_json: ANALYZE_RESPONSE.content[0]!.input,
      input_tokens: 99,
      output_tokens: 99,
      created_at: '2026-04-24T00:00:00Z',
    });

    const out = await analyzeRegions([sampleRegion], 'fr');

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.cacheStore).not.toHaveBeenCalled();
    // Cache hits log the would-have-been tokens so Settings can show savings.
    // cache_hit=true marks them as savings rather than real spend.
    expect(mocks.logCall).toHaveBeenCalledWith(expect.objectContaining({
      cache_hit: true,
      input_tokens: 99,
      output_tokens: 99,
    }));
    expect(out[0]?.analysis?.translation).toBe('hello');
  });

  it('throws MissingApiKeyError when no key is set', async () => {
    mocks.readApiKey.mockReturnValue(null);
    await expect(analyzeRegions([sampleRegion], 'fr')).rejects.toThrow(/API key not set/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('surfaces API errors with the server-supplied message', async () => {
    mocks.cacheLookup.mockResolvedValue(undefined);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'invalid_api_key' } }), { status: 401 }),
    );

    await expect(analyzeRegions([sampleRegion], 'fr')).rejects.toThrow('invalid_api_key');
    expect(mocks.cacheStore).not.toHaveBeenCalled();
  });

  it('throws when the model returns a payload that violates the schema', async () => {
    // Schema-violating cases used to be a class of bugs you had to hand-test
    // (missing field, wrong CEFR level, extra props, …). Arktype catches them
    // structurally — one test confirms the boundary is wired up.
    mocks.cacheLookup.mockResolvedValue(undefined);
    const malformed = {
      ...ANALYZE_RESPONSE,
      content: [{
        type: 'tool_use',
        name: 'submit_result',
        input: { analyses: [{ region_index: 0, vocabulary: [], grammar_notes: [], difficulty: 'Z9', cultural_notes: '', translation: 'x' }] },
      }],
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(malformed), { status: 200 }),
    );

    await expect(analyzeRegions([sampleRegion], 'fr')).rejects.toThrow(/Schema/);
    expect(mocks.cacheStore).not.toHaveBeenCalled();
  });

  it('treats a cached payload that no longer matches the schema as a miss', async () => {
    // Schema drift safety net: stale cache entries don't poison new responses.
    mocks.cacheLookup.mockResolvedValue({
      call_hash: 'whatever',
      call_type: 'analyze',
      response_json: { analyses: [{ region_index: 0, difficulty: 'A1', vocabulary: [], grammar_notes: [], translation: 'old' /* missing cultural_notes */ }] },
      input_tokens: 1,
      output_tokens: 1,
      created_at: '2026-04-24T00:00:00Z',
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(ANALYZE_RESPONSE), { status: 200 }),
    );

    const out = await analyzeRegions([sampleRegion], 'fr');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(out[0]?.analysis?.translation).toBe('hello');
  });
});
