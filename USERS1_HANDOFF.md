# USERS1 — Clean audience identity, and one Users domain

**State: IN PROGRESS. Phase 1 audit underway. Nothing modified yet.**

Read this file first. It records what the identity lifecycle actually is, what
is being changed, and what still needs a human with production access.

---

## Objective

Stop ordinary visitors and automation from becoming Supabase auth users;
distinguish human / automation / internal / unknown traffic; purge the polluted
pre-launch anonymous identities; reset analytics to a clean launch baseline; and
collapse Admin's People + Analytics into one **Users** domain where an aggregate
number drills into the individual records behind it.

## Starting main SHA

```
origin/main   cdfa23cf67f6a64b53066a32499e46339f466e94
              "LEGACY1: record the merge, and that the publish still needs a human"
branch        users1/audience-identity
worktree      .worktrees/users1
```

Verified with `git fetch origin && git log --oneline origin/main` — it matched
the SHA the brief expected and has not moved since LEGACY1 was merged.

## Identity lifecycle BEFORE this work

(filled in during Phase 1 — see below)

## Where anonymous auth users come from

(filled in during Phase 1)

## Open items requiring production access

This repository holds only the Supabase **anon/publishable** key (`.env`:
`VITE_SUPABASE_PUBLISHABLE_KEY`). There is no service-role key anywhere in the
tree and no Supabase MCP connector in this session, so **no agent can read
`auth.users`, count anonymous identities, or delete them from here.** Every
earlier phase handled this the same way (FUNNEL1 §15.9, §17.5): the SQL is
written here and the owner runs it in the Lovable / Supabase SQL Editor.

---

_This document is maintained through the workstream. Sections are appended as
each phase completes._
