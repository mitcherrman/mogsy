# Academy startup harness

Measures the Landing (`/`) → Living Hextech Orrery (`/lol`) journey and direct `/lol` visits on a **production build**:
when the Orrery mounts, when its first-screen art and Patch Report are in, when the scene is visually complete, and how
smoothly frames flow. Background: `docs/handoffs/ACADEMY_STARTUP_INVESTIGATION.md`. Opt-in tooling only: nothing here
runs in CI or ships.

```bash
# 1. a production build in its own folder (does not touch public/sitemap.xml)
node node_modules/vite/bin/vite.js build --outDir ../startup-dist --emptyOutDir

# 2. serve it with mogzy.lol's cache policy (HTTP/2 when ACADEMY_PERF_TLS_DIR has key.pem + cert.pem)
ACADEMY_PERF_TLS_DIR=../startup-tls node scripts/academy-startup/serve.mjs ../startup-dist 4418

# 3. measure (headed Edge; keep the window in front and the machine otherwise idle)
node scripts/academy-startup/run.mjs '{"label":"landing-warmgpu","cache":"warmgpu","reps":5}'
node scripts/academy-startup/run.mjs '{"label":"landing-4g","cache":"warmgpu","net":"4g"}'
node scripts/academy-startup/run.mjs '{"label":"direct","path":"/lol","cache":"warmgpu"}'

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
- **Headed only for frames.** Headless Chromium renders this scene in software. Headed Firefox windows are often
  background-throttled; `report.mjs` drops runs with < 100 frames and counts them as invalid.
- Do not use Playwright `route()` for stubbing: it disables the HTTP cache.
- Chromium device emulation (`mobile`) is not real-device validation.
