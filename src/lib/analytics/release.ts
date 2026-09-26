/** Canonical build identity injected once by Vite and reused by analytics. */
declare const __MOGZY_FRONTEND_RELEASE__: {
  commit: string;
  build: string;
};

export type FrontendRelease = Readonly<{ commit: string; build: string }>;

export const FRONTEND_RELEASE: FrontendRelease = Object.freeze(
  typeof __MOGZY_FRONTEND_RELEASE__ === "undefined"
    ? { commit: "unknown", build: "unknown" }
    : __MOGZY_FRONTEND_RELEASE__,
);

/** Stored on the session row; commit is canonical and build is a display alias. */
export const FRONTEND_RELEASE_ID = FRONTEND_RELEASE.commit.slice(0, 64);
