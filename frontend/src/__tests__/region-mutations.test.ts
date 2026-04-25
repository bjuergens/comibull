import { describe, it, expect } from 'vitest';
import { replaceRegionAt, type Region, type RegionAnalysis } from '../pages/comic-detail';

const baseAnalysis: RegionAnalysis = {
  vocabulary: [],
  grammar_notes: [],
  translation: 'hi',
  difficulty: 'A1',
  cultural_notes: '',
};

const region = (source: string, extra: Partial<Region> = {}): Region => ({
  bbox: [0, 0, 0.1, 0.1],
  source,
  ocr_text: `${source}-text`,
  ...extra,
});

describe('replaceRegionAt', () => {
  it('replaces only the region at the given index', () => {
    const regions = [region('a'), region('b'), region('c')];
    const result = replaceRegionAt(regions, 1, { ocr_text: 'new' });
    expect(result[0]).toBe(regions[0]);
    expect(result[2]).toBe(regions[2]);
    expect(result[1].ocr_text).toBe('new');
  });

  it('clears stale analysis on the replaced region', () => {
    // The whole reason this helper exists — any manual edit invalidates analysis.
    const regions = [region('a', { analysis: baseAnalysis })];
    const result = replaceRegionAt(regions, 0, { ocr_text: 'changed' });
    expect(result[0].analysis).toBeUndefined();
  });

  it('marks a known source as manually edited', () => {
    const regions = [region('bubble')];
    const result = replaceRegionAt(regions, 0, { bbox: [0, 0, 0.2, 0.2] });
    expect(result[0].source).toBe('bubble+manual');
  });

  it('does not double-apply +manual on an already-manual region', () => {
    const regions = [region('bubble+manual')];
    const result = replaceRegionAt(regions, 0, { ocr_text: 'x' });
    expect(result[0].source).toBe('bubble+manual');
  });
});
