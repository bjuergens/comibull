import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mantine requires these browser APIs that jsdom doesn't provide

const _getComputedStyle = window.getComputedStyle;
window.getComputedStyle = (elt, pseudoElt) => _getComputedStyle(elt, pseudoElt);

window.HTMLElement.prototype.scrollIntoView = vi.fn();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.ResizeObserver = ResizeObserverMock;
