# Academy startup harness

Measures the Landing (`/`) → Living Hextech Orrery (`/lol`) journey and direct `/lol` visits on a **production build**:
when the Orrery mounts, when its first-screen art and Patch Report are in, when the scene is visually complete, and how
smoothly frames flow. Background: `docs/handoffs/ACADEMY_STARTUP_INVESTIGATION.md`. Opt-in tooling only: nothing here
runs in CI or ships.

> **Local safety (AGENTS.md).** On a developer machine, run this only with the owner's explicit authorisation for that
> run. `run.mjs` then launches Playwright's **bundled Chromium, headless**, one browser at a time; it refuses installed
> Edge/Chrome and visible windows unless `CI` is set (GitHub Actions). Headless Chromium renders this scene in software, so
> local runs measure **load timings only** (mount, art, Patch Report, network milestones); frame-smoothness numbers need a
> real GPU (a CI runner with a headed browser). Stop owned servers when done; never kill browsers by name.

```bash
# 1. a production build in its own folder (does not touch public/sitemap.xml)
node node_modules/vite/bin/vite.js build --outDir ../startup-dist --emptyOutDir

# 2. serve it with mogzy.lol's cache policy (HTTP/2 when ACADEMY_PERF_TLS_DIR has key.pem + cert.pem)
ACADEMY_PERF_TLS_DIR=../startup-tls node scripts/academy-startup/serve.mjs ../startup-dist 4418

# 3. measure (locally: authorised runs only; headless bundled Chromium is the default)
node scripts/academy-startup/run.mjs '{"label":"landing","reps":3}'
node scripts/academy-startup/run.mjs '{"label":"landing-4g","net":"4g"}'
node scripts/academy-startup/run.mjs '{"label":"direct","path":"/lol"}'

# 4. summarise
node scripts/academy-startup/report.mjs test-results/academy-startup
```

To compare two builds, serve each on its own port and pass `"base":"https://127.0.0.1:<port>"`. All scenario fields are
documented at the top of `run.mjs`.

## What to keep in mind

- **Real hosts.** The bundle comes from the local server; the champion manifest, splashes, Patch API and Supabase are
  production. The probe answers Supabase *writes* locally, so measurements never enter the analytics funnel.
- **Cache states.** A fresh Playwright profile also has a cold GPU shader cache: it shows a 0.5–1.1 s first-frame stall that
  an established browser mostly does not. `warmgpu` (a new context in a browser that already rendered the scene) is the
  realistic first visit; report `cold` separately.
- **Throttling** (`net`, `cpu`) is Chromium-only (CDP). `cpu` throttles the CPU, not the GPU.
- **Frames need a real GPU.** Headless Chromium renders this scene in software, so its frame columns are not evidence.
  Headed runs belong on CI; headed Firefox windows are also often background-throttled (`report.mjs` drops runs with
  < 100 frames and counts them as invalid).
- Do not use Playwright `route()` for stubbing: it disables the HTTP cache.
- Chromium device emulation (`mobile`) is not real-device validation.
