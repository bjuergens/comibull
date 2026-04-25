import { useCallback, useEffect, useRef, useState } from 'react';
import { showError } from '../notifications';
import { analyzeRegions, detectPage, AnthropicError, MissingApiKeyError } from '../anthropic';
import { getComic, getPage, listPages, updatePage } from '../store';
import type { Bbox, ComicDetail, PageItem, Region } from './comic-detail';
import { buildComicDetail, isPageAnalyzed, isPageProcessing } from './comic-detail';
import { markManuallyEdited, replaceRegionAt } from '../shared-types';

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof MissingApiKeyError) return err.message;
  if (err instanceof AnthropicError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

export function usePageOperations(id: string | undefined, currentPageIdx: number) {
  const [comic, setComic] = useState<ComicDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Number(undefined) === NaN, so this handles both "no id" and "garbage id".
  const comicIdNum = Number(id);

  // Track object URLs so we can revoke them on refresh (prevent leaks).
  const urlsRef = useRef<string[]>([]);

  const refreshComic = useCallback(async () => {
    if (Number.isNaN(comicIdNum)) return;
    const row = await getComic(comicIdNum);
    if (!row) { setNotFound(true); return; }
    const pages = await listPages(comicIdNum);
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    const detail = buildComicDetail(row, pages);
    urlsRef.current = detail.pages.map(p => p.image_url);
    setComic(detail);
  }, [comicIdNum]);

  useEffect(() => { void refreshComic(); }, [refreshComic]);
  useEffect(() => () => {
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    urlsRef.current = [];
  }, []);

  const currentPage: PageItem | undefined = comic?.pages[currentPageIdx];
  const regions = currentPage?.regions ?? null;
  const hasRegions = regions !== null && regions.length > 0;
  const hasAnalysis = currentPage ? isPageAnalyzed(currentPage) : false;
  const pageProcessing = currentPage ? isPageProcessing(currentPage) : false;

  const sourceLanguage = comic?.source_language ?? 'fr';

  const runDetect = useCallback(async (pageId: number, doAnalyze: boolean) => {
    await updatePage(pageId, { status: 'processing', error_message: null });
    await refreshComic();
    try {
      const row = await getPage(pageId);
      if (!row) return;
      let nextRegions = await detectPage(row.image, sourceLanguage, pageId);
      if (doAnalyze && nextRegions.length > 0) {
        nextRegions = await analyzeRegions(nextRegions, sourceLanguage, pageId);
      }
      await updatePage(pageId, {
        regions: nextRegions,
        status: 'idle',
        error_message: null,
      });
    } catch (err) {
      const msg = errMsg(err, 'Erkennung fehlgeschlagen');
      await updatePage(pageId, { status: 'error', error_message: msg });
      showError('Erkennung fehlgeschlagen', msg);
    } finally {
      await refreshComic();
    }
  }, [refreshComic, sourceLanguage]);

  const detect = useCallback(() => {
    if (!currentPage) return Promise.resolve();
    return runDetect(currentPage.id, false);
  }, [currentPage, runDetect]);

  const detectAndAnalyze = useCallback(() => {
    if (!currentPage) return Promise.resolve();
    return runDetect(currentPage.id, true);
  }, [currentPage, runDetect]);

  async function saveRegions(updated: Region[]) {
    if (!currentPage) return;
    await updatePage(currentPage.id, { regions: updated });
    await refreshComic();
  }

  function handleClearRegions() { void saveRegions([]); }

  function handleSaveRegionEdit(regionIdx: number, newText: string) {
    if (!regions) return;
    void saveRegions(replaceRegionAt(regions, regionIdx, { ocr_text: newText }));
  }

  function handleDeleteRegion(regionIdx: number) {
    if (!regions) return;
    void saveRegions(regions.filter((_, i) => i !== regionIdx));
  }

  function handleUpdateRegionBbox(regionIdx: number, newBbox: Bbox) {
    if (!regions) return;
    void saveRegions(replaceRegionAt(regions, regionIdx, { bbox: newBbox }));
  }

  async function handleAddRegion(): Promise<number> {
    const newRegion: Region = { bbox: [0, 0, 0.15, 0.1], source: 'manual' };
    const updated = [...(regions ?? []), newRegion];
    await saveRegions(updated);
    return updated.length - 1;
  }

  function handleSplit(axis: 'x' | 'y', selectedRegionIdx: number | null) {
    if (selectedRegionIdx === null || !regions) return;
    const r = regions[selectedRegionIdx];
    if (!r) return;
    const [x1, y1, x2, y2] = r.bbox;
    const mid = axis === 'x' ? (x1 + x2) / 2 : (y1 + y2) / 2;
    const a = markManuallyEdited({ bbox: axis === 'x' ? [x1, y1, mid, y2] : [x1, y1, x2, mid], source: r.source });
    const b = markManuallyEdited({ bbox: axis === 'x' ? [mid, y1, x2, y2] : [x1, mid, x2, y2], source: r.source });
    const updated = [
      ...regions.slice(0, selectedRegionIdx),
      a, b,
      ...regions.slice(selectedRegionIdx + 1),
    ];
    void saveRegions(updated);
  }

  return {
    comic,
    pageProcessing,
    notFound,
    currentPage,
    regions,
    hasRegions,
    hasAnalysis,
    detect,
    detectAndAnalyze,
    handleClearRegions,
    handleSaveRegionEdit,
    handleDeleteRegion,
    handleUpdateRegionBbox,
    handleAddRegion,
    handleSplit,
  };
}
