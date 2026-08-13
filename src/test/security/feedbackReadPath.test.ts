import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * FB1 — the feedback read-path boundary.
 *
 * The shipped page read submissions with `.from("feedback").select("*")`, which
 * returns every column on the row. RLS was never the issue: it correctly limits
 * a user to their own rows. The issue is column reach *within* those rows, and
 * the column-level REVOKE meant to hide admin_notes is a no-op on this project
 * (ALTER DEFAULT PRIVILEGES grants table-level SELECT; a column REVOKE cannot
 * subtract from that — verified live in 20260730150000_league_profiles_rpc.sql).
 *
 * So the boundary is structural: user reads go through list_my_feedback(), a
 * RETURNS TABLE contract with no select() to append to. These tests stop the
 * old shape from creeping back in, which is the failure mode that matters —
 * one autocompleted `.select("*")` in a future phase silently undoes it.
 */

const SRC_DIR = join(process.cwd(), "src");
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * Files allowed to touch public.feedback through PostgREST at all.
 *   client.ts       — the sanctioned INSERT, which returns only `id`
 *   AdminFeedback   — admin-only surface: UPDATE/DELETE plus admin_list_feedback
 */
const TABLE_ACCESS_ALLOWLIST = [
  join("src", "lib", "feedback", "client.ts"),
  join("src", "components", "admin", "AdminFeedback.tsx"),
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The generated Supabase types describe every column of every table, including
 * admin-only ones. That is a schema description, not a read, so it is excluded
 * from the source scans below.
 */
const GENERATED_TYPES = join("src", "integrations", "supabase", "types.ts");

/** The module that declares which columns are admin-only. */
const CONTRACT = join("src", "lib", "feedback", "contract.ts");

const sourceFiles = () =>
  walk(SRC_DIR).filter(
    f => !/\.test\.tsx?$/.test(f) && !/__fixtures__/.test(f) && !f.endsWith(GENERATED_TYPES),
  );

/**
 * Strip comments so prose about the boundary never counts as a breach of it —
 * these files necessarily discuss `.select("*")` and the admin-only columns in
 * order to explain why they are forbidden.
 */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

const rel = (f: string) => f.slice(process.cwd().length + 1);

describe("no user-facing code reads public.feedback as a table", () => {
  it("only the allow-listed files reference the feedback table via PostgREST", () => {
    const offenders = sourceFiles().filter(file => {
      if (!/\.from\(\s*["']feedback["']\s*\)/.test(code(file))) return false;
      return !TABLE_ACCESS_ALLOWLIST.some(allowed => file.endsWith(allowed));
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("the feedback client never SELECTs from the feedback table", () => {
    const src = code(join(SRC_DIR, "lib", "feedback", "client.ts"));
    // Nothing anywhere in the module may ask for every column.
    expect(src).not.toMatch(/\.select\(\s*["']\*["']\s*\)/);
    // The one chained onto .from("feedback") is the id projection on
    // INSERT ... RETURNING — anything wider would hand back admin columns.
    const afterFeedback = src.slice(src.indexOf('.from("feedback")'));
    expect(afterFeedback.match(/\.select\((.*?)\)/)![1].trim()).toBe('"id"');
  });

  it("the submitter read path is the RPC", () => {
    expect(code(join(SRC_DIR, "lib", "feedback", "client.ts"))).toMatch(
      /supabase\.rpc\(\s*"list_my_feedback"/,
    );
  });

  it("the Feedback page goes through the client, never Supabase directly", () => {
    const src = code(join(SRC_DIR, "pages", "Feedback.tsx"));
    expect(src).not.toMatch(/\.from\(/);
    expect(src).not.toMatch(/supabase\.rpc\(/);
    expect(src).toMatch(/from "@\/lib\/feedback\/client"/);
  });

  it("no user-facing code names an admin-only column", () => {
    const userFacing = sourceFiles().filter(
      f =>
        !f.includes(join("src", "components", "admin")) &&
        !f.includes(join("src", "pages", "admin")),
    );
    const offenders = userFacing.filter(file => {
      // contract.ts names them once, in FEEDBACK_ADMIN_ONLY_FIELDS. That list
      // IS the boundary declaration, asserted below.
      if (file.endsWith(CONTRACT)) return false;
      return /\b(admin_notes|duplicate_of)\b/.test(code(file));
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("the contract names admin-only columns only to declare them", () => {
    const src = code(join(SRC_DIR, "lib", "feedback", "contract.ts"));
    const declaration = src.match(
      /FEEDBACK_ADMIN_ONLY_FIELDS\s*=\s*\[([\s\S]*?)\]\s*as const;/,
    );
    expect(declaration).not.toBeNull();
    expect(declaration![1]).toMatch(/"admin_notes"/);
    expect(declaration![1]).toMatch(/"client_meta"/);
    expect(declaration![1]).toMatch(/"duplicate_of"/);
    // One mention each — anywhere else would be a field being used, not named.
    for (const column of ["admin_notes", "client_meta", "duplicate_of"]) {
      expect(src.match(new RegExp(`\\b${column}\\b`, "g"))).toHaveLength(1);
    }
    // And none of them appears in the submitter-visible row shape.
    const rowShape = src.match(/interface MyFeedbackRow \{([\s\S]*?)\}/)![1];
    expect(rowShape).not.toMatch(/admin_notes|client_meta|duplicate_of/);
  });

  it("client_meta is written but never read back on a user path", () => {
    const userFacing = sourceFiles().filter(
      f =>
        !f.includes(join("src", "components", "admin")) &&
        !f.includes(join("src", "pages", "admin")),
    );
    // Only the insert payload in client.ts may name it, and only as a write.
    const offenders = userFacing.filter(file => {
      if (file.endsWith(join("src", "lib", "feedback", "client.ts"))) return false;
      if (file.endsWith(CONTRACT)) return false;
      return /\bclient_meta\b/.test(code(file));
    });
    expect(offenders.map(rel)).toEqual([]);

    const client = code(join(SRC_DIR, "lib", "feedback", "client.ts"));
    expect(client).toMatch(/client_meta:\s*input\.clientMeta/);
    expect(client.match(/\bclient_meta\b/g)).toHaveLength(1);
  });
});

describe("evidence storage boundary", () => {
  const storage = readFileSync(
    join(MIGRATIONS_DIR, "20260812130000_fb1_feedback_evidence_storage.sql"),
    "utf8",
  )
    .split("\n")
    .map(l => l.replace(/--.*$/, ""))
    .join("\n");

  it("creates the bucket private", () => {
    expect(storage).toMatch(/'feedback-evidence',\s*\n?\s*'feedback-evidence',\s*\n?\s*false/);
    // A public bucket would make every screenshot world-readable by URL forever.
    expect(storage).not.toMatch(/'feedback-evidence',\s*true/);
  });

  it("constrains size and type at the bucket, not just in the form", () => {
    expect(storage).toMatch(/5242880/);
    expect(storage).toMatch(/ARRAY\['image\/webp', 'image\/png', 'image\/jpeg'\]/);
  });

  it("scopes every object policy to the caller's own folder or to admins", () => {
    const policies = [...storage.matchAll(/CREATE POLICY "([^"]+)"[\s\S]*?;/g)].map(m => m[0]);
    expect(policies.length).toBe(4);
    for (const policy of policies) {
      const ownFolder = /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/.test(policy);
      const adminOnly = /has_role\(auth\.uid\(\), 'admin'/.test(policy);
      expect(ownFolder || adminOnly).toBe(true);
      expect(policy).toMatch(/bucket_id = 'feedback-evidence'/);
    }
  });

  it("grants no UPDATE and no owner DELETE, so submitted evidence cannot be swapped", () => {
    expect(storage).not.toMatch(/FOR UPDATE/);
    const deletes = [...storage.matchAll(/CREATE POLICY "([^"]+)"[\s\S]*?FOR DELETE[\s\S]*?;/g)];
    expect(deletes).toHaveLength(1);
    expect(deletes[0][0]).toMatch(/has_role\(auth\.uid\(\), 'admin'/);
  });

  it("attaches the path through a write-once, ownership-checked RPC", () => {
    const fn = storage.match(
      /CREATE OR REPLACE FUNCTION public\.attach_feedback_screenshot[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(fn).toMatch(/SET search_path = public/);
    // Ownership, write-once, and path confinement are all enforced.
    expect(fn).toMatch(/is_profile_owner/);
    expect(fn).toMatch(/feedback_screenshot_already_attached/);
    expect(fn).toMatch(/split_part\(_path, '\/', 1\) <> auth\.uid\(\)::text/);
    // It may only ever write the one column.
    const updates = [...fn.matchAll(/UPDATE public\.feedback[\s\S]*?;/g)];
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toMatch(/SET screenshot_path = _path/);
  });

  it("narrows EXECUTE away from PUBLIC and anon", () => {
    expect(storage).toMatch(
      /REVOKE ALL ON FUNCTION public\.attach_feedback_screenshot\(uuid, text\) FROM PUBLIC, anon;/,
    );
    expect(storage).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.attach_feedback_screenshot\(uuid, text\) TO authenticated;/,
    );
  });

  it("does not weaken any policy on public.feedback", () => {
    expect(storage).not.toMatch(/CREATE POLICY[\s\S]{0,120}?ON public\.feedback/);
    expect(storage).not.toMatch(/DROP POLICY/);
    expect(storage).not.toMatch(/GRANT[\s\S]{0,60}?ON public\.feedback/);
  });
});
