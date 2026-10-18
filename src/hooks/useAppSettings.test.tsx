import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ACADEMY STARTUP S1 — the app settings are read once per session and shared.
 * `Layout` gates on `loading`, so a settled shared read is what lets the
 * Landing's hand-off to /lol render the shell without a startup-surface frame.
 */

type Reply = { data: { key: string; value: unknown }[] | null } | Error;
const calls: number[] = [];
const replies: Array<() => Promise<{ data: { key: string; value: unknown }[] | null }>> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        calls.push(Date.now());
        const next = replies.shift();
        return next ? next() : Promise.resolve({ data: [] });
      },
    }),
  },
}));

import {
  __resetAppSettingsForTests,
  invalidateAppSettings,
  prefetchAppSettings,
  useAppSettings,
} from "./useAppSettings";

function reply(r: Reply) {
  replies.push(() => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r)));
}

function deferred() {
  let resolve!: (v: { data: { key: string; value: unknown }[] | null }) => void;
  const p = new Promise<{ data: { key: string; value: unknown }[] | null }>((r) => { resolve = r; });
  replies.push(() => p);
  return resolve;
}

const OPEN = { data: [{ key: "require_auth", value: { enabled: false } }] };

function Probe({ id, seen }: { id: string; seen: Record<string, { loading: boolean; requireAuth: boolean }[]> }) {
  const { settings, loading } = useAppSettings();
  (seen[id] ??= []).push({ loading, requireAuth: settings.require_auth });
  return null;
}

beforeEach(() => {
  __resetAppSettingsForTests();
  calls.length = 0;
  replies.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useAppSettings — one shared read per session", () => {
  it("two consumers mounted together share ONE request and both settle", async () => {
    reply(OPEN);
    const seen: Record<string, { loading: boolean; requireAuth: boolean }[]> = {};
    render(<><Probe id="a" seen={seen} /><Probe id="b" seen={seen} /></>);
    await waitFor(() => expect(seen.a.at(-1)).toEqual({ loading: false, requireAuth: false }));
    expect(seen.b.at(-1)).toEqual({ loading: false, requireAuth: false });
    expect(calls).toHaveLength(1);
  });

  it("a consumer mounted after the read settled starts settled (no loading frame) and reads nothing", async () => {
    reply(OPEN);
    const seen: Record<string, { loading: boolean; requireAuth: boolean }[]> = {};
    const first = render(<Probe id="a" seen={seen} />);
    await waitFor(() => expect(seen.a.at(-1)?.loading).toBe(false));
    first.unmount();
    render(<Probe id="b" seen={seen} />);
    expect(seen.b[0]).toEqual({ loading: false, requireAuth: false });
    expect(calls).toHaveLength(1);
  });

  it("prefetchAppSettings (the Landing's hold) makes the shell's first render settled", async () => {
    reply(OPEN);
    prefetchAppSettings();
    prefetchAppSettings(); // joins, never a second request
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const seen: Record<string, { loading: boolean; requireAuth: boolean }[]> = {};
    render(<Probe id="layout" seen={seen} />);
    expect(seen.layout[0]).toEqual({ loading: false, requireAuth: false });
    expect(calls).toHaveLength(1);
  });

  it("a consumer that mounts while the prefetch is in flight joins it", async () => {
    const resolve = deferred();
    prefetchAppSettings();
    const seen: Record<string, { loading: boolean; requireAuth: boolean }[]> = {};
    render(<Probe id="layout" seen={seen} />);
    expect(seen.layout[0].loading).toBe(true);
    await act(async () => { resolve(OPEN); });
    await waitFor(() => expect(seen.layout.at(-1)).toEqual({ loading: false, requireAuth: false }));
    expect(calls).toHaveLength(1);
  });
});

describe("useAppSettings — failures behave as before and are not cached", () => {
  it("no data: settles on the defaults (require_auth stays fail-closed) and the next mount reads again", async () => {
    reply({ data: null });
    const seen: Record<string, { loading: boolean; requireAuth: boolean }[]> = {};
    const first = render(<Probe id="a" seen={seen} />);
    await waitFor(() => expect(seen.a.at(-1)).toEqual({ loading: false, requireAuth: true }));
    first.unmount();
    reply(OPEN);
    render(<Probe id="b" seen={seen} />);
    expect(seen.b[0].loading).toBe(true);
    await waitFor(() => expect(seen.b.at(-1)).toEqual({ loading: false, requireAuth: false }));
    expect(calls).toHaveLength(2);
  });

  it("a rejected request no longer leaves the shell loading forever", async () => {
    reply(new Error("network down"));
    const seen: Record<string, { loading: boolean; requireAuth: boolean }[]> = {};
    render(<Probe id="a" seen={seen} />);
    await waitFor(() => expect(seen.a.at(-1)).toEqual({ loading: false, requireAuth: true }));
  });
});

describe("useAppSettings — freshness", () => {
  it("invalidateAppSettings (after an admin save) re-reads and updates mounted consumers", async () => {
    reply(OPEN);
    const seen: Record<string, { loading: boolean; requireAuth: boolean }[]> = {};
    render(<Probe id="a" seen={seen} />);
    await waitFor(() => expect(seen.a.at(-1)?.requireAuth).toBe(false));
    reply({ data: [{ key: "require_auth", value: { enabled: true } }] });
    await act(async () => { invalidateAppSettings(); });
    await waitFor(() => expect(seen.a.at(-1)).toEqual({ loading: false, requireAuth: true }));
    expect(calls).toHaveLength(2);
    expect(seen.a.some((s, i) => i > 0 && s.loading)).toBe(false);
  });

  it("a mount after five minutes revalidates in the background without a loading frame", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    reply(OPEN);
    const seen: Record<string, { loading: boolean; requireAuth: boolean }[]> = {};
    const first = render(<Probe id="a" seen={seen} />);
    await waitFor(() => expect(seen.a.at(-1)?.loading).toBe(false));
    first.unmount();
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
    reply({ data: [{ key: "require_auth", value: { enabled: true } }] });
    render(<Probe id="b" seen={seen} />);
    expect(seen.b[0]).toEqual({ loading: false, requireAuth: false });
    await waitFor(() => expect(seen.b.at(-1)).toEqual({ loading: false, requireAuth: true }));
    expect(calls).toHaveLength(2);
  });
});
