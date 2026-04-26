// View-model types used by reader/editor pages. Adapts the IndexedDB row
// shapes from src/store.ts into the shapes these components expect
// (notably: image_url as a string, since <img src> can't take a Blob).

import type { ComicRow, PageRow } from '../store';
import type { PageStatus, Region, SourceLanguage } from '../shared-types';
export type { Bbox, Region, RegionAnalysis, CefrLevel, PageStatus } from '../shared-types';
export { markManuallyEdited, replaceRegionAt, REGION_TYPE_LABEL } from '../shared-types';

export interface PageItem {
  id: number;
  display_order: number;
  image_url: string;  // object URL; lifecycle owned by page hook
  regions: Region[] | null;
  status: PageStatus;
  error_message: string | null;
}

export interface ComicDetail {
  id: number;
  title: string;
  source_language: SourceLanguage;
  pages: PageItem[];
  created_at: string;
}

// Create object URLs for each page's image blob. Caller must revoke when the
// hook unmounts or refreshes — usePageOperations tracks them in a ref.
export function buildComicDetail(comic: ComicRow, pages: PageRow[]): ComicDetail {
  return {
    id: comic.id,
    title: comic.title,
    source_language: comic.source_language,
    created_at: comic.created_at,
    pages: pages.map(row => ({
      id: row.id,
      display_order: row.display_order,
      image_url: URL.createObjectURL(row.image),
      regions: row.regions,
      status: row.status,
      error_message: row.error_message,
    })),
  };
}

export function isAnalyzedWithNoText(region: Region): boolean {
  return region.analysis != null && !region.ocr_text?.trim();
}

export function isPageProcessing(page: PageItem): boolean {
  return page.status === 'processing';
}

export function isPageError(page: PageItem): boolean {
  return page.status === 'error';
}

// regions=[] means detection ran and found no text — vacuously all analyzed.
export function isPageAnalyzed(page: PageItem): boolean {
  return page.regions != null && page.regions.every(r => r.analysis != null);
}

export interface StatusBadge {
  label: string;
  color: string;
  tooltip?: string;
}

export function pageBadge(page: PageItem): StatusBadge {
  if (isPageError(page)) {
    return { label: 'Fehler', color: 'red', tooltip: page.error_message || 'Unbekannter Fehler' };
  }
  if (isPageProcessing(page)) return { label: 'Verarbeitung...', color: 'blue' };
  if (isPageAnalyzed(page)) return { label: 'Analysiert', color: 'green' };
  return { label: 'Bereit', color: 'gray' };
}

export function pagePreviewText(page: PageItem): string {
  return page.regions?.find(r => r.ocr_text?.trim())?.ocr_text?.trim() ?? '—';
}

export interface RegionDetailPanelProps {
  region: Region;
  regionIdx: number;
  canEditTextboxes: boolean;
  debugMode: boolean;
  onClose: () => void;
  onSaveEdit: (newText: string) => void | Promise<void>;
}

export interface PageImageWithOverlayProps {
  page: PageItem;
  regions: Region[] | null;
  selectedRegionIdx: number | null;
  canEditTextboxes: boolean;
  debugMode?: boolean;
  onSelectRegion: (idx: number | null) => void;
  onUpdateRegionBbox: (idx: number, bbox: import('../shared-types').Bbox) => void;
}
