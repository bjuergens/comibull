import { describe, it, expect } from 'vitest';
import { computePopoverPosition } from '../pages/ComicDetailPage';

// Helper: simulate image filling the wrapper exactly (no panzoom offset)
function simpleLayout(wrapperW: number, wrapperH: number) {
  return {
    wrapperRect: { width: wrapperW, height: wrapperH },
    imgRect: { left: 0, top: 0, width: wrapperW, height: wrapperH },
    wrapperOffset: { left: 0, top: 0 },
    viewportWidth: 1200,
  };
}

describe('computePopoverPosition', () => {
  it('places popover to the right when space is available', () => {
    // Region on the left side of a wide wrapper
    const layout = simpleLayout(1000, 800);
    const pos = computePopoverPosition(
      [0.05, 0.1, 0.2, 0.3], // region at ~5%-20% x
      layout.wrapperRect, layout.imgRect, layout.wrapperOffset, layout.viewportWidth,
    );
    // regionRight = 200, spaceRight = 800 — plenty of room
    expect(pos.left).toBe(200 + 8); // regionRight + 8px gap
    expect(pos.top).toBeGreaterThanOrEqual(4);
    expect(pos.maxHeight).toBeGreaterThan(0);
  });

  it('places popover to the left when right space is insufficient', () => {
    // Region on the right side
    const layout = simpleLayout(1000, 800);
    const pos = computePopoverPosition(
      [0.7, 0.1, 0.95, 0.3], // region at ~70%-95% x
      layout.wrapperRect, layout.imgRect, layout.wrapperOffset, layout.viewportWidth,
    );
    // regionLeft = 700, spaceLeft = 700 — enough for popover
    // popoverWidth = min(min(640, max(320, 360)), 992) = 360
    const popoverWidth = Math.min(640, Math.max(320, 1200 * 0.3));
    expect(pos.left).toBe(700 - popoverWidth - 8);
  });

  it('places popover below when no horizontal space and region is near top', () => {
    // Narrow wrapper, region in the middle — forces vertical placement
    const layout = simpleLayout(300, 800);
    const pos = computePopoverPosition(
      [0.1, 0.05, 0.9, 0.15], // wide region near top
      layout.wrapperRect, layout.imgRect, layout.wrapperOffset, layout.viewportWidth,
    );
    // spaceAbove = 40, spaceBelow = 680 → below
    const regionBottom = 0.15 * 800;
    expect(pos.top).toBe(regionBottom + 8);
  });

  it('places popover above when no horizontal space and region is near bottom', () => {
    const layout = simpleLayout(300, 800);
    const pos = computePopoverPosition(
      [0.1, 0.8, 0.9, 0.95], // wide region near bottom
      layout.wrapperRect, layout.imgRect, layout.wrapperOffset, layout.viewportWidth,
    );
    // spaceAbove = 640, spaceBelow = 40 → above
    expect(pos.top).toBeGreaterThanOrEqual(4);
    expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(0.8 * 800);
  });

  it('enforces minimum popover height', () => {
    // Very short wrapper
    const layout = simpleLayout(1000, 250);
    const pos = computePopoverPosition(
      [0.05, 0.4, 0.2, 0.9], // region takes most of the height
      layout.wrapperRect, layout.imgRect, layout.wrapperOffset, layout.viewportWidth,
    );
    expect(pos.maxHeight).toBeGreaterThanOrEqual(200 - 8); // MIN_POPOVER_HEIGHT minus padding
  });

  it('popover stays within wrapper bounds', () => {
    const layout = simpleLayout(800, 600);
    const pos = computePopoverPosition(
      [0.3, 0.3, 0.7, 0.7], // centered region
      layout.wrapperRect, layout.imgRect, layout.wrapperOffset, layout.viewportWidth,
    );
    expect(pos.top).toBeGreaterThanOrEqual(4);
    expect(pos.left).toBeGreaterThanOrEqual(0);
    expect(pos.left + pos.width).toBeLessThanOrEqual(800);
    expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(600);
  });

  it('handles panzoom offset (image shifted within wrapper)', () => {
    const pos = computePopoverPosition(
      [0.0, 0.0, 0.1, 0.1],
      { width: 800, height: 600 },
      { left: 50, top: 30, width: 400, height: 300 }, // image offset and scaled
      { left: 10, top: 10 }, // wrapper offset on screen
      1200,
    );
    // regionRight = (50 - 10) + 0.1 * 400 = 40 + 40 = 80
    expect(pos.left).toBe(80 + 8);
    expect(pos.top).toBeGreaterThanOrEqual(4);
  });

  it('responsive width scales with viewport', () => {
    const layout = simpleLayout(1000, 800);
    const narrow = computePopoverPosition(
      [0.05, 0.1, 0.2, 0.3],
      layout.wrapperRect, layout.imgRect, layout.wrapperOffset,
      800, // narrow viewport
    );
    const wide = computePopoverPosition(
      [0.05, 0.1, 0.2, 0.3],
      layout.wrapperRect, layout.imgRect, layout.wrapperOffset,
      2000, // wide viewport
    );
    // 800 * 0.3 = 240 → clamped to 320; 2000 * 0.3 = 600
    expect(narrow.width).toBe(320);
    expect(wide.width).toBe(600);
  });
});
