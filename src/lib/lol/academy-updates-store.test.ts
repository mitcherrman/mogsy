/**
 * Academy Updates — the database boundary.
 *
 * Two things are worth testing here and they pull in opposite directions:
 *
 *   * the PUBLIC read must never surface a failure — every error path resolves
 *     to an empty list, because a broken read may cost a badge and never the
 *     Hall;
 *   * the ADMIN read must always surface one, because an admin staring at an
 *     empty list needs to know whether that means "nothing written" or "the
 *     read failed", and those demand opposite responses.
 *
 * Row-level authorization is Postgres's, not this module's, so what is asserted
 * here is that the client asks the narrow question (published rows only) and
 * validates what comes back rather than trusting it. The RLS policies
 * themselves are asserted in academy-updates-rls.test.ts against the migration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  /** Recorded calls, so the shape of the query can be asserted. */
  calls: [] as { op: string; args: unknown[] }[],
  selectResult: { data: null as unknown[] | null, error: null as { message: string } | null },
  writeResult: { error: null as { message: string } | null },
  settingRow: { data: null as unknown, error: null as { message: string } | null },
  /** When set, the builder throws instead of resolving — the "client blew up"
   *  path, which is not the same as a Postgres error. */
  throwOnSelect: false,
}));

vi.mock("@/integrations/supabase/client", () => {
  const record = (op: string, ...args: unknown[]) => mocks.calls.push({ op, args });

  // A chainable stand-in: order()/eq() return the same object, and awaiting it
  // yields the configured result. That mirrors supabase-js closely enough for
  // the query shape to be meaningful.
  const chain = () => {
    const self: Record<string, unknown> = {
      eq: (...a: unknown[]) => {
        record("eq", ...a);
        return self;
      },
      order: (...a: unknown[]) => {
        record("order", ...a);
        return self;
      },
      maybeSingle: async () => mocks.settingRow,
      then: (resolve: (v: unknown) => void) => {
        if (mocks.throwOnSelect) throw new Error("client exploded");
        return resolve(mocks.selectResult);
      },
    };
    return self;
  };

  return {
    supabase: {
      from: (table: string) => {
        record("from", table);
        return {
          select: (columns: string) => {
            record("select", columns);
            if (mocks.throwOnSelect) throw new Error("client exploded");
            return chain();
          },
          insert: async (row: unknown) => {
            record("insert", row);
            return mocks.writeResult;
          },
          update: (patch: unknown) => {
            record("update", patch);
            return {
              eq: async (...a: unknown[]) => {
                record("eq", ...a);
                return mocks.writeResult;
              },
            };
          },
          delete: () => {
            record("delete");
            return {
              eq: async (...a: unknown[]) => {
                record("eq", ...a);
                return mocks.writeResult;
              },
            };
          },
          upsert: async (row: unknown) => {
            record("upsert", row);
            return mocks.writeResult;
          },
        };
      },
    },
  };
});

import {
  ACADEMY_UPDATES_TABLE,
  createUpdate,
  deleteUpdate,
  listAllUpdatesForAdmin,
  listPublishedUpdates,
  readAcademyUpdatesEnabled,
  setUpdatePublished,
  toAcademyUpdate,
  toAcademyUpdates,
  updateUpdate,
  writeAcademyUpdatesEnabled,
} from "./academy-updates-store";

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ranked is open",
  body: "You can now queue for a ranked match.",
  publish_date: "2026-09-05",
  published: true,
  cta_label: "Open Ranked",
  cta_href: "/lol/ranked",
};

beforeEach(() => {
  mocks.calls = [];
  mocks.selectResult = { data: null, error: null };
  mocks.writeResult = { error: null };
  mocks.settingRow = { data: null, error: null };
  mocks.throwOnSelect = false;
});
afterEach(() => vi.clearAllMocks());

const op = (name: string) => mocks.calls.filter((c) => c.op === name);

describe("toAcademyUpdate", () => {
  it("maps a well-formed row onto the shape the surface renders", () => {
    expect(toAcademyUpdate(ROW)).toEqual({
      id: ROW.id,
      date: "2026-09-05",
      title: "Ranked is open",
      body: "You can now queue for a ranked match.",
      published: true,
      cta: { label: "Open Ranked", href: "/lol/ranked" },
    });
  });

  it("drops a row with no usable id", () => {
    // The id is what a browser stores as "seen". A row without one could make
    // every visitor see every notice as new, forever.
    expect(toAcademyUpdate({ ...ROW, id: null })).toBeNull();
    expect(toAcademyUpdate({ ...ROW, id: "" })).toBeNull();
  });

  it("drops a row whose published flag is not a boolean", () => {
    // `published` is the draft guarantee restated client-side. A row that
    // cannot answer the question is not a row to render.
    expect(toAcademyUpdate({ ...ROW, published: "yes" })).toBeNull();
    expect(toAcademyUpdate({ ...ROW, published: null })).toBeNull();
  });

  it("drops anything that is not a row at all", () => {
    expect(toAcademyUpdate(null)).toBeNull();
    expect(toAcademyUpdate("a string")).toBeNull();
    expect(toAcademyUpdate(42)).toBeNull();
  });

  it("omits a half-written CTA rather than rendering a dead button", () => {
    expect(toAcademyUpdate({ ...ROW, cta_href: null })?.cta).toBeUndefined();
    expect(toAcademyUpdate({ ...ROW, cta_label: null })?.cta).toBeUndefined();
    expect(toAcademyUpdate({ ...ROW, cta_label: "   " })?.cta).toBeUndefined();
  });

  it("keeps the good rows and discards the bad ones in a mixed batch", () => {
    const out = toAcademyUpdates([ROW, { ...ROW, id: null }, { ...ROW, id: "b" }]);
    expect(out.map((u) => u.id)).toEqual([ROW.id, "b"]);
  });

  it("treats a non-array as nothing", () => {
    expect(toAcademyUpdates(null)).toEqual([]);
    expect(toAcademyUpdates(undefined)).toEqual([]);
  });
});

describe("the public read", () => {
  it("asks only for published rows, newest first", async () => {
    mocks.selectResult = { data: [ROW], error: null };
    await listPublishedUpdates();

    expect(op("from")[0].args[0]).toBe(ACADEMY_UPDATES_TABLE);
    // The narrowing the client asks for. RLS refuses the rest regardless, so
    // this is belt-and-braces, not the guarantee.
    expect(op("eq")[0].args).toEqual(["published", true]);
    expect(op("order").map((c) => c.args)).toEqual([
      ["publish_date", { ascending: false }],
      ["created_at", { ascending: false }],
    ]);
  });

  it("does not ask for the maintenance columns a visitor has no use for", async () => {
    mocks.selectResult = { data: [ROW], error: null };
    await listPublishedUpdates();
    const columns = op("select")[0].args[0] as string;
    expect(columns).toContain("title");
    expect(columns).not.toContain("created_at");
    expect(columns).not.toContain("updated_at");
  });

  it("returns an empty list when Postgres reports an error", async () => {
    mocks.selectResult = { data: null, error: { message: "permission denied" } };
    await expect(listPublishedUpdates()).resolves.toEqual([]);
  });

  it("returns an empty list when the client itself throws", async () => {
    mocks.throwOnSelect = true;
    await expect(listPublishedUpdates()).resolves.toEqual([]);
  });

  it("returns an empty list when the table does not exist yet", async () => {
    // The state between merging this and the owner applying the migration.
    mocks.selectResult = {
      data: null,
      error: { message: 'relation "public.academy_updates" does not exist' },
    };
    await expect(listPublishedUpdates()).resolves.toEqual([]);
  });

  it("coalesces concurrent reads into one request", async () => {
    // The Hall mounts this feature twice (desktop mark + mobile row), so
    // without coalescing every enabled load made two identical requests.
    mocks.selectResult = { data: [ROW], error: null };
    const [a, b] = await Promise.all([listPublishedUpdates(), listPublishedUpdates()]);
    expect(a).toEqual(b);
    expect(op("from")).toHaveLength(1);
  });

  it("does not remember a failed read as an answer", async () => {
    // Coalescing is not caching: once the promise settles the slot is cleared,
    // so the next visit asks again rather than inheriting an empty list.
    mocks.selectResult = { data: null, error: { message: "boom" } };
    await expect(listPublishedUpdates()).resolves.toEqual([]);
    mocks.selectResult = { data: [ROW], error: null };
    await expect(listPublishedUpdates()).resolves.toHaveLength(1);
    expect(op("from")).toHaveLength(2);
  });

  it("survives a malformed payload by dropping only the bad rows", async () => {
    mocks.selectResult = { data: [ROW, { nonsense: true }], error: null };
    const out = await listPublishedUpdates();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(ROW.id);
  });
});

describe("the admin read", () => {
  it("asks for every row, drafts included, and reports a failure", async () => {
    mocks.selectResult = { data: null, error: { message: "boom" } };
    const result = await listAllUpdatesForAdmin();
    expect(result.rows).toEqual([]);
    expect(result.error).toBe("boom");
    // No `published` filter: the admin list must show drafts.
    expect(op("eq")).toHaveLength(0);
  });

  it("includes the maintenance columns the public read omits", async () => {
    mocks.selectResult = { data: [ROW], error: null };
    await listAllUpdatesForAdmin();
    expect(op("select")[0].args[0] as string).toContain("updated_at");
  });

  it("returns rows verbatim, so drafts keep their real state", async () => {
    const draft = { ...ROW, id: "draft-1", published: false };
    mocks.selectResult = { data: [ROW, draft], error: null };
    const { rows, error } = await listAllUpdatesForAdmin();
    expect(error).toBeNull();
    expect(rows.map((r) => r.published)).toEqual([true, false]);
  });
});

describe("writes", () => {
  it("creates as a draft, whatever the caller passed", async () => {
    await createUpdate({
      title: "t", body: "b", publish_date: "2026-09-05", cta_label: null, cta_href: null,
    });
    const inserted = op("insert")[0].args[0] as Record<string, unknown>;
    // Publishing is a separate, deliberate act on a row that already exists.
    expect(inserted.published).toBe(false);
  });

  it("edits content without touching visibility", async () => {
    await updateUpdate("id-1", {
      title: "t", body: "b", publish_date: "2026-09-05", cta_label: null, cta_href: null,
    });
    const patch = op("update")[0].args[0] as Record<string, unknown>;
    expect("published" in patch).toBe(false);
    expect(op("eq")[0].args).toEqual(["id", "id-1"]);
  });

  it("changes visibility without touching content or the id", async () => {
    await setUpdatePublished("id-1", true);
    const patch = op("update")[0].args[0] as Record<string, unknown>;
    // The id staying put is what stops a correction becoming an announcement.
    expect(patch).toEqual({ published: true });
  });

  it("deletes by id and reports a refusal", async () => {
    mocks.writeResult = { error: { message: "new row violates row-level security policy" } };
    const { error } = await deleteUpdate("id-1");
    expect(op("eq")[0].args).toEqual(["id", "id-1"]);
    expect(error).toContain("row-level security");
  });
});

describe("the master switch", () => {
  it("reads the enabled flag out of its app_settings row", async () => {
    mocks.settingRow = { data: { value: { enabled: true } }, error: null };
    await expect(readAcademyUpdatesEnabled("academy_updates_enabled")).resolves.toEqual({
      enabled: true,
      error: null,
    });
    expect(op("from")[0].args[0]).toBe("app_settings");
    expect(op("eq")[0].args).toEqual(["key", "academy_updates_enabled"]);
  });

  it("treats a missing row as off, and not as an error", async () => {
    // A database that has not been migrated yet is simply one where the
    // feature is off — which is the honest reading, not a fault to report.
    mocks.settingRow = { data: null, error: null };
    await expect(readAcademyUpdatesEnabled("academy_updates_enabled")).resolves.toEqual({
      enabled: false,
      error: null,
    });
  });

  it("fails closed on a malformed value", async () => {
    mocks.settingRow = { data: { value: { enabled: "yes" } }, error: null };
    const { enabled } = await readAcademyUpdatesEnabled("academy_updates_enabled");
    expect(enabled).toBe(false);
  });

  it("fails closed, and says so, when the read is refused", async () => {
    mocks.settingRow = { data: null, error: { message: "permission denied" } };
    const result = await readAcademyUpdatesEnabled("academy_updates_enabled");
    expect(result.enabled).toBe(false);
    expect(result.error).toBe("permission denied");
  });

  it("writes only the one key it was given, with a body it constructs", async () => {
    await writeAcademyUpdatesEnabled("academy_updates_enabled", true);
    expect(op("upsert")[0].args[0]).toEqual({
      key: "academy_updates_enabled",
      value: { enabled: true },
    });
  });

  it("reports a refused write instead of claiming success", async () => {
    mocks.writeResult = { error: { message: "permission denied for table app_settings" } };
    const { error } = await writeAcademyUpdatesEnabled("academy_updates_enabled", true);
    expect(error).toContain("permission denied");
  });
});
