/**
 * Centralized lazy importers for app routes, exposed both as React.lazy
 * components and as raw importer functions so we can warm the bundle
 * chunks (and any modules they statically import) before the user
 * actually navigates. This eliminates the white-flash on first visit
 * to each page.
 */
import { lazy } from "react";
import type React from "react";

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  const wrapped = async () => {
    try {
      const mod = await factory();
      if (typeof window !== "undefined") {
        try { sessionStorage.removeItem("__lov_chunk_reloaded__"); } catch {}
      }
      return mod;
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isChunkError =
        /dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(
          msg,
        );
      if (isChunkError && typeof window !== "undefined") {
        const key = "__lov_chunk_reloaded_at__";
        const last = Number(sessionStorage.getItem(key) || "0");
        const now = Date.now();
        // Allow a reload at most once every 30s to break stale-chunk loops
        // after a redeploy without trapping the user if reload doesn't help.
        if (now - last > 30_000) {
          sessionStorage.setItem(key, String(now));
          window.location.reload();
          return new Promise(() => {}) as any;
        }
      }
      throw err;
    }
  };
  return { Component: lazy(wrapped), prefetch: wrapped };
}

export const Routes = {
  Index: lazyWithRetry(() => import("@/pages/Index")),
  Home: lazyWithRetry(() => import("@/pages/Home")),
  Auth: lazyWithRetry(() => import("@/pages/Auth")),
  Play: lazyWithRetry(() => import("@/pages/Play")),
  Profile: lazyWithRetry(() => import("@/pages/Profile")),
  Swipe: lazyWithRetry(() => import("@/pages/Swipe")),
  SwipeHub: lazyWithRetry(() => import("@/pages/SwipeHub")),
  Leagues: lazyWithRetry(() => import("@/pages/Leagues")),
  Leaderboard: lazyWithRetry(() => import("@/pages/Leaderboard")),
  SwipePreset: lazyWithRetry(() => import("@/pages/SwipePreset")),
  Settings: lazyWithRetry(() => import("@/pages/Settings")),
  Referral: lazyWithRetry(() => import("@/pages/Referral")),
  Admin: lazyWithRetry(() => import("@/pages/Admin")),
  Shop: lazyWithRetry(() => import("@/pages/Shop")),
  EloCheck: lazyWithRetry(() => import("@/pages/EloCheck")),
  SwipeLeagues: lazyWithRetry(() => import("@/pages/SwipeLeagues")),
  UserProfile: lazyWithRetry(() => import("@/pages/UserProfile")),
  ResetPassword: lazyWithRetry(() => import("@/pages/ResetPassword")),
  AdminPlay: lazyWithRetry(() => import("@/pages/AdminPlay")),
  AdminData: lazyWithRetry(() => import("@/pages/AdminData")),
  AdminDemo: lazyWithRetry(() => import("@/pages/AdminDemo")),
  AdminGaming: lazyWithRetry(() => import("@/pages/AdminGaming")),
  SecretRoom: lazyWithRetry(() => import("@/pages/SecretRoom")),
  Moderator: lazyWithRetry(() => import("@/pages/Moderator")),
  CustomLink: lazyWithRetry(() => import("@/pages/CustomLink")),
  Multiplayer: lazyWithRetry(() => import("@/pages/Multiplayer")),
  MultiplayerGame: lazyWithRetry(() => import("@/pages/MultiplayerGame")),
  Feedback: lazyWithRetry(() => import("@/pages/Feedback")),
  BlogIndex: lazyWithRetry(() => import("@/pages/blog/BlogIndex")),
  BlogPost: lazyWithRetry(() => import("@/pages/blog/BlogPost")),
  AdminBlog: lazyWithRetry(() => import("@/pages/admin/AdminBlog")),
  AdminBlogEditor: lazyWithRetry(() => import("@/pages/admin/AdminBlogEditor")),
  CombatLab: lazyWithRetry(() => import("@/pages/CombatLab")),
  CombatLabDiagnostics: lazyWithRetry(() => import("@/pages/CombatLabDiagnostics")),
  Quiz: lazyWithRetry(() => import("@/pages/Quiz")),
  QuizDiagnostics: lazyWithRetry(() => import("@/pages/QuizDiagnostics")),
  QuizAdmin: lazyWithRetry(() => import("@/pages/QuizAdmin")),
  LolHub: lazyWithRetry(() => import("@/pages/LolHub")),
  LolTierList: lazyWithRetry(() => import("@/pages/LolTierList")),
  AdminAbout: lazyWithRetry(() => import("@/pages/AdminAbout")),
  AdminDiagnostics: lazyWithRetry(() => import("@/pages/AdminDiagnostics")),
} as const;

/** Map URL path → list of route keys to warm. Supports basic prefix matching. */
const PATH_TO_KEYS: Array<{ test: (p: string) => boolean; keys: (keyof typeof Routes)[] }> = [
  { test: (p) => p === "/home", keys: ["Home"] },
  { test: (p) => p === "/play", keys: ["Play"] },
  { test: (p) => p === "/swipe", keys: ["SwipeHub", "SwipePreset", "Swipe"] },
  { test: (p) => p === "/swipe-game", keys: ["Swipe"] },
  { test: (p) => p.startsWith("/swipe/preset"), keys: ["SwipePreset"] },
  { test: (p) => p === "/profile", keys: ["Profile"] },
  { test: (p) => p === "/settings", keys: ["Settings"] },
  { test: (p) => p === "/shop", keys: ["Shop"] },
  { test: (p) => p === "/combat-lab", keys: ["CombatLab"] },
  { test: (p) => p === "/combat-lab/diagnostics", keys: ["CombatLabDiagnostics"] },
  { test: (p) => p === "/quiz", keys: ["Quiz"] },
  { test: (p) => p === "/quiz/diagnostics", keys: ["QuizDiagnostics"] },
  { test: (p) => p === "/quiz/admin", keys: ["QuizAdmin"] },
  { test: (p) => p === "/lol", keys: ["LolHub", "CombatLab", "Quiz"] },
  { test: (p) => p === "/lol/tier-list", keys: ["LolTierList"] },
  { test: (p) => p === "/leaderboard" || p.startsWith("/leaderboard/"), keys: ["Leaderboard"] },
  { test: (p) => p.startsWith("/leagues/"), keys: ["Leagues"] },
  { test: (p) => p === "/blog", keys: ["BlogIndex"] },
  { test: (p) => p.startsWith("/blog/"), keys: ["BlogPost"] },
  { test: (p) => p === "/feedback", keys: ["Feedback"] },
  { test: (p) => p === "/referral", keys: ["Referral"] },
  { test: (p) => p === "/multiplayer", keys: ["Multiplayer"] },
];

const warmed = new Set<string>();

export function prefetchRoute(path: string) {
  if (typeof window === "undefined") return;
  if (warmed.has(path)) return;
  warmed.add(path);
  const match = PATH_TO_KEYS.find((m) => m.test(path));
  if (!match) return;
  // Schedule via idle so we never compete with the current navigation paint
  const run = () => {
    for (const k of match.keys) {
      Routes[k].prefetch().catch(() => {});
    }
  };
  const ric: any = (window as any).requestIdleCallback;
  if (ric) ric(run, { timeout: 1500 });
  else setTimeout(run, 200);
}

/** Warm a batch of likely-next routes (called once after first paint). */
export function prefetchLikelyRoutes(paths: string[]) {
  paths.forEach(prefetchRoute);
}

/** Warm image URLs into the browser cache off the critical path. */
export function prefetchImages(urls: (string | null | undefined)[]) {
  if (typeof window === "undefined") return;
  const run = () => {
    for (const url of urls) {
      if (!url) continue;
      const img = new Image();
      img.decoding = "async";
      (img as any).fetchPriority = "low";
      img.src = url;
    }
  };
  const ric: any = (window as any).requestIdleCallback;
  if (ric) ric(run, { timeout: 2000 });
  else setTimeout(run, 300);
}