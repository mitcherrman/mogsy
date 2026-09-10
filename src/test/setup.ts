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
