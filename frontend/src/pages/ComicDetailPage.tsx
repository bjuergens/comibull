import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Group, Button, Text, Loader, Paper, ActionIcon, Menu } from '@mantine/core';
import { useLocalStorage, useMediaQuery } from '@mantine/hooks';
import { useSettings } from '../SettingsContext';
import { useComicBreadcrumbs } from './useComicBreadcrumbs';
import { usePageOperations } from './usePageOperations';
import { PageImageWithOverlay } from './PageImageWithOverlay';
import { PageAnalysisStatus } from './PageAnalysisStatus';
import { RegionDetailPanel } from './RegionDetailPanel';
import { MobileRegionSheet } from './MobileRegionSheet';
import { type Bbox, Region } from './comic-detail';

const MIN_POPOVER_HEIGHT = 200;

const NAV_PILL_STYLE: React.CSSProperties = {
  position: 'absolute', bottom: '0.5rem', left: '50%', transform: 'translateX(-50%)',
  zIndex: 20, display: 'flex', gap: 4,
  background: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 4,
};

interface PopoverPos { top: number; left: number; width: number; maxHeight: number }

export function computePopoverPosition(
  bbox: Bbox,
  wrapperRect: { width: number; height: number },
  imgRect: { left: number; top: number; width: number; height: number },
  wrapperOffset: { left: number; top: number },
  viewportWidth: number,
): PopoverPos {
  const [x1, y1, x2, y2] = bbox;

  const regionLeft = imgRect.left - wrapperOffset.left + x1 * imgRect.width;
  const regionRight = imgRect.left - wrapperOffset.left + x2 * imgRect.width;
  const regionTop = imgRect.top - wrapperOffset.top + y1 * imgRect.height;
  const regionBottom = imgRect.top - wrapperOffset.top + y2 * imgRect.height;

  const popoverWidth = Math.min(
    Math.min(640, Math.max(320, viewportWidth * 0.3)),
    wrapperRect.width - 8,
  );
  const spaceRight = wrapperRect.width - regionRight;
  const spaceLeft = regionLeft;

  let left: number;
  let verticalAnchor: 'side' | 'below' | 'above' = 'side';
  if (spaceRight >= popoverWidth + 8) {
    left = regionRight + 8;
  } else if (spaceLeft >= popoverWidth + 8) {
    left = regionLeft - popoverWidth - 8;
  } else {
    left = Math.max(4, Math.min(regionLeft, wrapperRect.width - popoverWidth - 4));
    const spaceBelow = wrapperRect.height - regionBottom;
    const spaceAbove = regionTop;
    verticalAnchor = spaceAbove > spaceBelow ? 'above' : 'below';
  }

  let top: number;
  let maxHeight: number;
  if (verticalAnchor === 'below') {
    top = regionBottom + 8;
    maxHeight = wrapperRect.height - top - 4;
  } else if (verticalAnchor === 'above') {
    top = 4;
    maxHeight = regionTop - 12;
  } else {
    top = Math.max(4, Math.min(regionTop, wrapperRect.height - MIN_POPOVER_HEIGHT - 4));
    maxHeight = wrapperRect.height - top - 4;
  }

  if (maxHeight < MIN_POPOVER_HEIGHT) {
    top = Math.max(4, wrapperRect.height - MIN_POPOVER_HEIGHT - 4);
    maxHeight = wrapperRect.height - top - 4;
  }

  return { top, left, width: popoverWidth, maxHeight };
}

function usePopoverPosition(
  wrapper: HTMLDivElement | null,
  regions: Region[] | null,
  selectedRegionIdx: number | null,
) {
  const [pos, setPos] = useState<PopoverPos | null>(null);

  const update = useCallback(() => {
    if (selectedRegionIdx === null || !regions || !wrapper) { setPos(null); return; }
    const region = regions[selectedRegionIdx];
    if (!region) { setPos(null); return; }
    const img = wrapper.querySelector('img');
    if (!img) { setPos(null); return; }
    const wrapperRect = wrapper.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    setPos(computePopoverPosition(
      region.bbox,
      { width: wrapperRect.width, height: wrapperRect.height },
      { left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height },
      { left: wrapperRect.left, top: wrapperRect.top },
      window.innerWidth,
    ));
  }, [wrapper, regions, selectedRegionIdx]);

  useEffect(() => {
    update();
    if (!wrapper) return;
    const handler = () => requestAnimationFrame(update);
    wrapper.addEventListener('panzoomchange', handler, true);
    wrapper.addEventListener('wheel', handler, { passive: true });
    window.addEventListener('resize', handler);
    return () => {
      wrapper.removeEventListener('panzoomchange', handler, true);
      wrapper.removeEventListener('wheel', handler);
      window.removeEventListener('resize', handler);
    };
  }, [update, wrapper]);

  return pos;
}

export default function ComicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings, setSetting } = useSettings();
  const [debugMode] = useLocalStorage<boolean>({ key: 'debug_mode', defaultValue: false });
  const initialPage = Math.max(0, parseInt(searchParams.get('page') ?? '1', 10) - 1);
  const [currentPageIdx, setCurrentPageIdx] = useState(initialPage);
  const [selectedRegionIdx, setSelectedRegionIdx] = useState<number | null>(null);
  const [pageCard, setPageCard] = useState<HTMLDivElement | null>(null);

  const ops = usePageOperations(id, currentPageIdx);
  const { comic, currentPage, regions, hasRegions, hasAnalysis,
    pageProcessing, notFound } = ops;

  const popoverPos = usePopoverPosition(pageCard, regions, selectedRegionIdx);
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false;

  useComicBreadcrumbs(id, comic?.title, 'Leser');

  const totalPages = comic?.pages.length ?? 0;
  useEffect(() => {
    if (totalPages > 0 && currentPageIdx >= totalPages) setCurrentPageIdx(totalPages - 1);
  }, [totalPages, currentPageIdx]);

  useEffect(() => {
    if (!comic) return;
    const pages = comic.pages;
    const preloads: HTMLImageElement[] = [];
    for (const idx of [currentPageIdx - 1, currentPageIdx + 1]) {
      const page = pages[idx];
      if (page) {
        const img = new Image();
        img.src = page.image_url;
        preloads.push(img);
      }
    }
    return () => { preloads.forEach(img => { img.src = ''; }); };
  }, [comic, currentPageIdx]);

  if (!comic) {
    if (notFound) return <Container pt="xl" />;
    return <Container pt="xl"><Loader /></Container>;
  }

  function goToPage(idx: number) {
    setCurrentPageIdx(idx);
    setSelectedRegionIdx(null);
  }

  function handleSelectRegion(idx: number | null) { setSelectedRegionIdx(idx); }

  const selectedRegion: Region | null = selectedRegionIdx !== null ? (regions?.[selectedRegionIdx] ?? null) : null;

  const panelProps = selectedRegion && selectedRegionIdx !== null ? {
    region: selectedRegion,
    regionIdx: selectedRegionIdx,
    canEditTextboxes: settings.canEditTextboxes,
    debugMode,
    onClose: () => handleSelectRegion(null),
    onSaveEdit: (newText: string) => ops.handleSaveRegionEdit(selectedRegionIdx, newText),
  } : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - var(--app-shell-header-offset, 0rem) - 2 * var(--mantine-spacing-md))', padding: '0 var(--mantine-spacing-md)' }}>
      {currentPage && (
        <PageAnalysisStatus
          page={currentPage}
          onStart={() => { void ops.detectAndAnalyze(); }}
        />
      )}

      {settings.canEditTextboxes && debugMode && (
        <Group mb="xs" gap={4}>
          <Button variant="subtle" size="compact-sm" onClick={() => { void ops.handleAddRegion().then(setSelectedRegionIdx); }}>
            + Box
          </Button>
          {selectedRegionIdx !== null && (
            <>
              <Button variant="subtle" size="compact-sm" onClick={() => ops.handleSplit('x', selectedRegionIdx)}>Teilen X</Button>
              <Button variant="subtle" size="compact-sm" onClick={() => ops.handleSplit('y', selectedRegionIdx)}>Teilen Y</Button>
              <Button variant="subtle" color="red" size="compact-sm" onClick={() => { ops.handleDeleteRegion(selectedRegionIdx); setSelectedRegionIdx(null); }}>
                Box löschen
              </Button>
            </>
          )}
        </Group>
      )}

      <div ref={setPageCard} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div style={NAV_PILL_STYLE}>
          <ActionIcon variant="filled" color="gray" size="md"
            disabled={currentPageIdx === 0}
            onClick={() => goToPage(currentPageIdx - 1)}>
            ←
          </ActionIcon>
          <Text data-testid="page-indicator" size="xs" c="white" style={{ alignSelf: 'center', padding: '0 4px', whiteSpace: 'nowrap' }}>
            {currentPageIdx + 1} / {totalPages}
          </Text>
          <ActionIcon data-testid="next-page-btn" variant="filled" color="gray" size="md"
            disabled={currentPageIdx >= totalPages - 1}
            onClick={() => goToPage(currentPageIdx + 1)}>
            →
          </ActionIcon>
          <Menu position="top-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="filled" color="gray" size="md" title="Weitere Aktionen" data-testid="page-actions-menu">⋯</ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {hasAnalysis && (
                <Menu.Item disabled={pageProcessing} onClick={() => { void ops.detectAndAnalyze(); }}>
                  Neu analysieren
                </Menu.Item>
              )}
              <Menu.Item onClick={() => setSetting('canEditTextboxes', !settings.canEditTextboxes)}>
                {settings.canEditTextboxes ? 'Bearbeitung beenden' : 'Boxen bearbeiten'}
              </Menu.Item>
              <Menu.Item onClick={() => void navigate(`/comics/${id}/edit`)}>
                Comic bearbeiten
              </Menu.Item>
              {debugMode && (
                <>
                  <Menu.Divider />
                  <Menu.Label>Debug</Menu.Label>
                  <Menu.Item disabled={pageProcessing} onClick={() => hasRegions ? ops.handleClearRegions() : void ops.detect()}>
                    {hasRegions ? 'Boxen löschen' : 'Nur erkennen'}
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>

        {currentPage && (
          <PageImageWithOverlay
            page={currentPage}
            regions={regions}
            selectedRegionIdx={selectedRegionIdx}
            canEditTextboxes={settings.canEditTextboxes}
            debugMode={debugMode}
            onSelectRegion={handleSelectRegion}
            onUpdateRegionBbox={ops.handleUpdateRegionBbox}
          />
        )}

        {!isMobile && panelProps && popoverPos && (
          <Paper
            withBorder
            shadow="md"
            p="sm"
            data-testid="region-card"
            style={{
              position: 'absolute',
              top: popoverPos.top,
              left: popoverPos.left,
              width: popoverPos.width,
              maxHeight: popoverPos.maxHeight,
              overflowY: 'auto',
              zIndex: 30,
              pointerEvents: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <RegionDetailPanel key={selectedRegionIdx ?? -1} {...panelProps} />
          </Paper>
        )}
      </div>

      {isMobile && (
        <MobileRegionSheet
          opened={panelProps !== null}
          onClose={() => handleSelectRegion(null)}
          panelProps={panelProps}
        />
      )}
    </div>
  );
}
