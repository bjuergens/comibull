import { Fragment, useCallback, useEffect, useState, useRef } from 'react';
import Panzoom from '@panzoom/panzoom';
import type { PanzoomObject } from '@panzoom/panzoom';
import { type Bbox, type PageImageWithOverlayProps, isAnalyzedWithNoText, isPageAnalyzed, isPageError } from './comic-detail';
import styles from './PageImageWithOverlay.module.css';

const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
type Corner = typeof CORNERS[number];

const PANZOOM_EXCLUDE_CLASS = 'panzoom-exclude';

interface DragState {
  type: 'move' | 'resize';
  regionIdx: number;
  handle: Corner | '';
  startNorm: [number, number];
  origBbox: Bbox;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function computeDraggedBbox(drag: DragState, cur: [number, number]): Bbox {
  const dx = cur[0] - drag.startNorm[0];
  const dy = cur[1] - drag.startNorm[1];
  const [x1, y1, x2, y2] = drag.origBbox;

  if (drag.type === 'move') {
    const w = x2 - x1, h = y2 - y1;
    const nx1 = clamp(x1 + dx, 0, 1 - w);
    const ny1 = clamp(y1 + dy, 0, 1 - h);
    return [nx1, ny1, nx1 + w, ny1 + h];
  }

  const corner = drag.handle;
  let nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2;
  if (corner.includes('w')) nx1 = clamp(x1 + dx, 0, nx2 - 0.01);
  if (corner.includes('e')) nx2 = clamp(x2 + dx, nx1 + 0.01, 1);
  if (corner.includes('n')) ny1 = clamp(y1 + dy, 0, ny2 - 0.01);
  if (corner.includes('s')) ny2 = clamp(y2 + dy, ny1 + 0.01, 1);
  return [nx1, ny1, nx2, ny2];
}

function cursorForCorner(corner: Corner): string {
  if (corner === 'nw' || corner === 'se') return 'nwse-resize';
  return 'nesw-resize';
}

export function PageImageWithOverlay({
  page,
  regions,
  selectedRegionIdx,
  canEditTextboxes,
  debugMode,
  onSelectRegion,
  onUpdateRegionBbox,
}: PageImageWithOverlayProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panzoomRef = useRef<PanzoomObject | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const wasDragging = useRef(false);
  const [dragBbox, setDragBbox] = useState<{ idx: number; bbox: Bbox } | null>(null);

  const callbackRef = useRef(onUpdateRegionBbox);
  callbackRef.current = onUpdateRegionBbox;

  // Hide detected-but-not-analyzed bboxes for non-debug users — they looked like a loading glitch.
  // Exception: on error, show whatever we got (bboxes from a successful detect step).
  const hasAnalysis = isPageAnalyzed(page);
  const shouldShowRegions = debugMode || hasAnalysis || isPageError(page);

  // Wrapper dimensions excluding padding.
  const getAvail = useCallback(() => {
    const img = imgRef.current;
    const wrapper = wrapperRef.current;
    if (!img || !wrapper || !img.naturalWidth || !img.naturalHeight) return null;
    if (wrapper.clientWidth === 0 || wrapper.clientHeight === 0) return null;
    const cs = getComputedStyle(wrapper);
    const availW = wrapper.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = wrapper.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return { availW, availH };
  }, []);

  // With transform-origin 50% 50%, centering requires panX = (availW - naturalW) / (2 * scale).
  const centerPan = useCallback((scale: number) => {
    const img = imgRef.current;
    const avail = getAvail();
    if (!img || !avail) return { x: 0, y: 0 };
    const x = (avail.availW - img.naturalWidth) / (2 * scale);
    const y = (avail.availH - img.naturalHeight) / (2 * scale);
    return { x, y };
  }, [getAvail]);

  const zoomToFit = useCallback(() => {
    const img = imgRef.current;
    const pz = panzoomRef.current;
    const avail = getAvail();
    if (!img || !pz || !avail) return;
    const fitScale = Math.min(avail.availW / img.naturalWidth, avail.availH / img.naturalHeight, 1);
    pz.setOptions({ minScale: fitScale * 0.5 });
    pz.zoom(fitScale, { animate: false });
    const c = centerPan(fitScale);
    pz.pan(c.x, c.y, { animate: false });
  }, [getAvail, centerPan]);

  const onImageLoad = useCallback(() => {
    setImageLoaded(true);
    requestAnimationFrame(() => zoomToFit());
  }, [zoomToFit]);

  useEffect(() => {
    const el = innerRef.current;
    const wrapper = wrapperRef.current;
    if (!el || !wrapper) return;

    const pz = Panzoom(el, {
      maxScale: 10,
      cursor: 'default', // default is 'move', but we have interactive overlays
      excludeClass: PANZOOM_EXCLUDE_CLASS, // skip mousedown inside text boxes / resize handles
    });
    panzoomRef.current = pz;

    // If image is already cached/loaded, fit immediately
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      requestAnimationFrame(() => zoomToFit());
    }

    // After any zoom, center axes where the scaled image fits within the container
    function centerIfSmaller(e: Event) {
      const scale: number = (e as CustomEvent<{ scale: number }>).detail?.scale;
      const img = imgRef.current;
      if (!scale || !img || !img.naturalWidth) return;

      const avail = getAvail();
      if (!avail) return;
      const cur = pz.getPan();
      let x = cur.x, y = cur.y;
      if (img.naturalWidth * scale <= avail.availW) x = (avail.availW - img.naturalWidth) / (2 * scale);
      if (img.naturalHeight * scale <= avail.availH) y = (avail.availH - img.naturalHeight) / (2 * scale);
      if (x !== cur.x || y !== cur.y) pz.pan(x, y, { animate: false });
    }

    function onWheel(e: WheelEvent) {
      const target = e.target as HTMLElement;
      if (target.closest(`.${PANZOOM_EXCLUDE_CLASS}`)) return;
      pz.zoomWithWheel(e);
    }
    wrapper.addEventListener('wheel', onWheel, { passive: false });
    wrapper.addEventListener('panzoomzoom', centerIfSmaller);

    // Re-fit when viewport resizes (updates minScale too)
    const ro = new ResizeObserver(() => zoomToFit());
    ro.observe(wrapper);

    return () => {
      ro.disconnect();
      wrapper.removeEventListener('wheel', onWheel);
      wrapper.removeEventListener('panzoomzoom', centerIfSmaller);
      pz.destroy();
      panzoomRef.current = null;
    };
  }, [zoomToFit, getAvail]);

  useEffect(() => {
    // Fit outgoing image before it swaps, so it doesn't flash at natural size.
    zoomToFit();
  }, [page.image_url, zoomToFit]);

  function toNormalized(clientX: number, clientY: number): [number, number] {
    const overlay = overlayRef.current;
    if (!overlay) return [0, 0];
    const r = overlay.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return [0, 0];
    return [
      clamp((clientX - r.left) / r.width, 0, 1),
      clamp((clientY - r.top) / r.height, 0, 1),
    ];
  }

  // Document-level drag handlers for move/resize
  useEffect(() => {
    if (!canEditTextboxes) return;

    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();
      wasDragging.current = true;
      setDragBbox({ idx: drag.regionIdx, bbox: computeDraggedBbox(drag, toNormalized(e.clientX, e.clientY)) });
    }

    function onUp(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();
      const round4 = (v: number) => Math.round(v * 10000) / 10000;
      const bbox = computeDraggedBbox(drag, toNormalized(e.clientX, e.clientY));
      const rounded: Bbox = [round4(bbox[0]), round4(bbox[1]), round4(bbox[2]), round4(bbox[3])];
      dragRef.current = null;
      setDragBbox(null);

      const orig = drag.origBbox;
      if (rounded[0] === round4(orig[0]) && rounded[1] === round4(orig[1]) &&
          rounded[2] === round4(orig[2]) && rounded[3] === round4(orig[3])) return;

      callbackRef.current(drag.regionIdx, rounded);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [canEditTextboxes]);

  function startMove(e: React.MouseEvent, regionIdx: number, bbox: Bbox) {
    e.preventDefault();
    e.stopPropagation();
    wasDragging.current = false;
    dragRef.current = { type: 'move', regionIdx, handle: '', startNorm: toNormalized(e.clientX, e.clientY), origBbox: [...bbox] };
  }

  function startResize(e: React.MouseEvent, regionIdx: number, handle: Corner, bbox: Bbox) {
    e.preventDefault();
    e.stopPropagation();
    wasDragging.current = false;
    dragRef.current = { type: 'resize', regionIdx, handle, startNorm: toNormalized(e.clientX, e.clientY), origBbox: [...bbox] };
  }

  function handleZoomIn() {
    panzoomRef.current?.zoomIn({ animate: false });
  }
  function handleZoomOut() {
    panzoomRef.current?.zoomOut({ animate: false });
  }
  function handleZoomReset() { zoomToFit(); }

  return (
    <div ref={wrapperRef} className={styles.imageWrapper} data-testid="page-card">
      <div className={styles.zoomControls}>
        <button onClick={handleZoomIn} title="Vergrößern">+</button>
        <button onClick={handleZoomOut} title="Verkleinern">&minus;</button>
        <button onClick={handleZoomReset} title="Zoom zurücksetzen">&#8634;</button>
      </div>
      <div ref={innerRef} className={styles.imageInner} onClick={() => onSelectRegion(null)}>
        <img
          key={page.image_url}
          ref={imgRef}
          src={page.image_url}
          alt={`Seite ${page.page_number}`}
          className={styles.pageImage}
          draggable={false}
          onLoad={onImageLoad}
        />
        {imageLoaded && shouldShowRegions && regions && regions.length > 0 && (
          <div
            ref={overlayRef}
            className={styles.textOverlay}
            data-testid="region-overlay"
          >
            {regions.map((region, i) => {
              const bbox = (dragBbox && dragBbox.idx === i) ? dragBbox.bbox : region.bbox;
              const [x1, y1, x2, y2] = bbox;
              const isSelected = selectedRegionIdx === i;
              const isAnalyzed = region.analysis != null;
              const noText = isAnalyzedWithNoText(region);
              const displayText = region.ocr_text ?? '';

              const stateClass = noText ? styles.textBoxNoText : isAnalyzed ? styles.textBoxAnalyzed : styles.textBoxDetected;
              const boxClass = [
                styles.textBox,
                PANZOOM_EXCLUDE_CLASS,
                stateClass,
                isSelected ? styles.textBoxSelected : '',
                canEditTextboxes ? styles.textBoxEditable : '',
              ].filter(Boolean).join(' ');

              return (
                <Fragment key={i}>
                  <div
                    className={boxClass}
                    style={{
                      left: `${x1 * 100}%`,
                      top: `${y1 * 100}%`,
                      width: `${(x2 - x1) * 100}%`,
                      height: `${(y2 - y1) * 100}%`,
                    }}
                    onMouseDown={canEditTextboxes ? (e) => {
                      if (e.button !== 0) return;
                      startMove(e, i, bbox);
                    } : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (wasDragging.current) { wasDragging.current = false; return; }
                      onSelectRegion(isSelected ? null : i);
                    }}
                    data-testid="region-rect"
                  >
                    {displayText && (
                      <span className={styles.textBoxText}>{displayText}</span>
                    )}
                  </div>
                  {isSelected && canEditTextboxes && CORNERS.map(corner => (
                    <div
                      key={corner}
                      className={`${styles.resizeHandle} ${PANZOOM_EXCLUDE_CLASS}`}
                      style={{
                        left: corner.includes('w') ? `${x1 * 100}%` : `${x2 * 100}%`,
                        top: corner.includes('n') ? `${y1 * 100}%` : `${y2 * 100}%`,
                        cursor: cursorForCorner(corner),
                      }}
                      onMouseDown={(e) => startResize(e, i, corner, bbox)}
                    />
                  ))}
                </Fragment>
              );
            })}
          </div>
        )}
        {hasAnalysis && (
          <span className={styles.statusBadge} data-testid="status-badge" data-status="analyzed">
            ✅ analysiert
          </span>
        )}
      </div>
    </div>
  );
}
