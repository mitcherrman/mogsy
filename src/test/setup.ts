import "@testing-library/jest-dom";

// This file is the global setup for every suite, and almost every suite is a
// jsdom one. A suite may opt into the `node` environment (see
// pt2cProfileFrameAuthority.test.ts, which runs a real Postgres in wasm and
// touches no DOM); there `window` does not exist, and unguarded access here
// would fail the whole file before a single test ran.
if (typeof window !== "undefined") {
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
}

// Radix popovers (the Pro Play stats filters, and anything else built on
// @radix-ui/react-popper) measure their trigger with a ResizeObserver, and
// jsdom ships none. Without this every popover test dies on
// "ResizeObserver is not defined" before it can assert anything.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// cmdk scrolls the highlighted item into view; jsdom has no layout.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
