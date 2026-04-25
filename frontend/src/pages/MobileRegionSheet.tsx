import { useCallback, useRef, useState } from 'react';
import { Drawer } from '@mantine/core';
import { RegionDetailPanel } from './RegionDetailPanel';
import type { RegionDetailPanelProps } from './comic-detail';

const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 120;
const DISMISS_THRESHOLD = 80;

interface MobileRegionSheetProps {
  opened: boolean;
  onClose: () => void;
  panelProps: RegionDetailPanelProps | null;
}

export function MobileRegionSheet({ opened, onClose, panelProps }: MobileRegionSheetProps) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragState.current = { startY: e.clientY, startHeight: height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [height]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dy = dragState.current.startY - e.clientY;
    const maxHeight = window.innerHeight * 0.8;
    setHeight(Math.max(MIN_HEIGHT, Math.min(maxHeight, dragState.current.startHeight + dy)));
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragState.current) return;
    dragState.current = null;
    if (height < DISMISS_THRESHOLD) {
      onClose();
      setHeight(DEFAULT_HEIGHT);
    }
  }, [height, onClose]);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size={height}
      withOverlay={false}
      lockScroll={false}
      withCloseButton={false}
      styles={{
        content: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
        body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column' },
      }}
      zIndex={30}
    >
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '8px 0 4px',
          cursor: 'grab',
          touchAction: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ccc' }} />
      </div>

      {/* Scrollable content */}
      <div data-testid="region-card" style={{ flex: 1, overflowY: 'auto', padding: '0 var(--mantine-spacing-sm) var(--mantine-spacing-sm)' }}>
        {panelProps && <RegionDetailPanel key={panelProps.regionIdx} {...panelProps} />}
      </div>
    </Drawer>
  );
}
