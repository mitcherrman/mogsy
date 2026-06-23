/**
 * League of Legends section changelog.
 *
 * Each entry documents a notable change shipped through Lovable for any LoL-related
 * surface (the /lol hub, /lol/tier-list, /combat-lab, /quiz). The data here is
 * intentionally human-curated — append a new entry at the TOP whenever a LoL
 * feature, page, or layout changes so the docs page stays accurate and copy/paste
 * to ChatGPT stays useful.
 *
 * AUTO-UPDATE CONVENTION (for the Lovable AI assistant):
 * Whenever you (the AI) ship ANY change that touches a LoL surface — the /lol hub,
 * /lol/tier-list, /lol/docs, /combat-lab*, /quiz*, the Hextech theme, the LoL
 * navbar/back button, or any /lol-only component — you MUST prepend a new
 * LolChangeEntry to LOL_CHANGELOG below in the SAME turn as the change.
 * Use the current UTC timestamp, pick an accurate `type` and `scopes`, write a
 * one-paragraph `summary`, list concrete UI/behavior bullets in `details`, and
 * list every file you edited in `files` plus every route affected in `routes`.
 * This file IS the source of truth that powers /lol/docs and the ChatGPT copy
 * buttons — skipping the entry silently breaks the docs.
 */

export type LolChangeType =
  | "feature"
  | "fix"
  | "ui"
  | "theme"
  | "security"
  | "refactor"
  | "docs";

export type LolChangeScope =
  | "hub"
  | "tier-list"
  | "combat-lab"
  | "quiz"
  | "theme"
  | "navigation"
  | "docs";

export interface LolChangeEntry {
  /** ISO timestamp (UTC) when the change shipped. */
  timestamp: string;
  title: string;
  type: LolChangeType;
  scopes: LolChangeScope[];
  /** One-paragraph plain-English summary. */
  summary: string;
  /** Optional bullet points with extra detail (UI layout, buttons, behavior). */
  details?: string[];
  /** Files touched (relative paths). */
  files?: string[];
  /** Routes affected, e.g. "/lol", "/combat-lab". */
  routes?: string[];
}

export const LOL_CHANGELOG: LolChangeEntry[] = [
  {
    timestamp: "2026-06-23T12:00:00Z",
    title: "Combat Lab: Defender HP Polish",
    type: "ui",
    scopes: ["combat-lab"],
    summary:
      "Tightened the feedback loop between combat actions and visible target damage. The Last Action summary moved directly under the Combat Actions card so the result of every Basic Attack or active appears immediately beside the button that triggered it. The Defender HP card now leads with a much larger Current / Max HP readout and a bolder HP percentage, the HP bar briefly pulses red and outlines when the defender takes a hit, and the floating '-N' damage indicator is larger and animates into view above the bar. Stat tiles (Armor / MR / Shield / DR) are de-emphasized so HP stays the visual anchor; the HP source diagnostic remains gated to Dev Mode. The Combat Feed now defaults to the latest 8 humanized events with a 'Show full log' toggle that expands to the recent history and a 'Collapse log' control to restore the compact view. No layout, payload, or backend changes — Damage Breakdown, Damage Mitigation, Active Defender Effects, Target Runtime Summary, Targets panel, and diagnostics are untouched.",
    details: [
      "LastActionCard moved into the attacker column directly below the Combat Actions card (Combat Actions → Last Action → Damage Breakdown), so each Basic Attack / active immediately shows attacker, ability, damage dealt, and resulting defender HP without scrolling.",
      "DefenderHPCard: Current HP rendered at text-4xl extrabold, percentage promoted to text-lg bold, HP bar grown to h-5 with a 700ms width transition and a red ring + pulse overlay while a flash is active.",
      "Floating damage indicator enlarged (text-base extrabold, slide-in-from-bottom + fade-in) and repositioned above the bar so the -N number is impossible to miss.",
      "Defender stat tiles (Armor, MR, Shield, DR, Phys DR, Magic DR) rendered at reduced opacity to keep HP as the primary source of truth; Dev Mode HP-source line preserved.",
      "ReadableCombatFeed defaults to the latest 8 events and exposes a 'Show full log (+N)' / 'Collapse log' toggle in the header; full event count and humanized lines are unchanged.",
      "HP derivation, flash effect trigger, scopes/state reset on champion/mode change, and combat payloads remain identical.",
    ],
    files: ["src/pages/CombatLab.tsx", "src/lib/lol-changelog.ts"],
    routes: ["/combat-lab"],
  },
  {
    timestamp: "2026-06-21T17:00:00Z",
    title: "Combat Lab: Visible Defender HP State",
    type: "ui",
    scopes: ["combat-lab"],
    summary:
      "Combat Lab now visibly behaves like a versus simulator instead of a calculator. A dedicated Defender HP card sits at the top of the defender column with a large Current / Max HP readout, a color-coded HP bar (green → amber → red as HP drops), and a brief -damage flash whenever the defender takes a hit. HP is derived from the latest backend response in priority order (remaining_by_scope.PRIMARY → state.remaining_hp → state.states.TARGET_REMAINING_HP → target_stats.TARGET_REMAINING_HP) with Max HP from target_stats.TARGET_MAX_HP / HP and the dummy HP for Custom Target Dummy mode. A Last Action summary card above Damage Breakdown shows the most recent attack: who attacked, the ability, damage dealt, damage type, and the defender's current / max HP. Combat Feed entries are now humanized with attacker and defender names ('Ashe basic attacks Alistar for 53 physical damage', 'Alistar's Unbreakable Will reduces incoming damage by 75%').",
    details: [
      "New DefenderHPCard component rendered at the top of the Defender column for both Champion Defender and Custom Target Dummy modes, showing Current / Max HP, an animated HP bar, percentage remaining, and the defender's Armor / MR / Shield / DR / Phys DR / Magic DR.",
      "New LastActionCard component rendered above Damage Breakdown with attacker name, ability/event label, damage dealt + damage type, and the defender's resulting HP.",
      "humanizeEvent() now takes attacker/defender names and produces player-readable lines for basic attacks, abilities, shields, damage reduction, stat changes and active casts.",
      "HP updates animate via a CSS width transition, and HP decreases briefly flash a red '-N' indicator over the bar.",
      "Reset, champion changes and target-mode changes already clear scopes/state/events; defender HP is purely derived so it resets along with them — old defender HP never carries into a new defender or mode.",
      "PRIMARY scope is the single source of truth for the Defender HP card; auxiliary scopes (Runaan, etc.) remain visible in the existing Targets panel below.",
      "Dev mode shows a one-line 'HP source: …' diagnostic on the HP card so future combat integrations can be validated.",
      "Existing Damage Breakdown, Damage Mitigation, Active Defender Effects, Target Runtime Summary, Combat Feed, Targets panel, diagnostics and backend payloads are untouched.",
    ],
    files: ["src/pages/CombatLab.tsx", "src/lib/lol-changelog.ts"],
    routes: ["/combat-lab"],
  },
  {
    timestamp: "2026-06-21T16:00:00Z",
    title: "Quiz: Gameplay-first home hierarchy",
    type: "ui",
    scopes: ["quiz"],
    summary:
      "Reorganized the /quiz home so playable content sits near the top instead of sitting beneath progression panels. The new order is Header → Daily Challenge hero → Quiz Mode Cards → Ranked Queue → compact Progression Dashboard (rank progress) → collapsible Knowledge Breakdown → collapsible Achievements. Daily Challenge stays the primary retention CTA, the actual quiz set cards moved up directly underneath it, and Ranked dropped to a secondary competitive CTA below practice modes. Knowledge Breakdown and Achievements are now collapsed by default so they no longer block new users from seeing the playable modes. No systems removed — all existing daily/ranked mocks, XP/rank progress, knowledge stats, achievements, diagnostics, answer feedback and missed-question review are preserved.",
    details: [
      "Pulled the quiz set grid out of its own bottom section and rendered it directly under the Daily Challenge hero (still gated to phase === 'sets').",
      "Moved QuizRankedQueueCard below the quiz mode grid.",
      "QuizKnowledgeCard and QuizAchievementsCard wrapped in shadcn Collapsible triggers with a chevron, label, and an unlocked/total badge on the Achievements trigger; both collapsed by default.",
      "Dashboard sections only render in the 'sets' phase so the active question and result screens stay focused.",
      "Mobile stacking preserved; desktop quiz modes keep the 2-column grid.",
    ],
    files: ["src/pages/Quiz.tsx", "src/lib/lol-changelog.ts"],
    routes: ["/quiz"],
  },
  {
    timestamp: "2026-06-21T15:00:00Z",
    title: "Combat Lab: Defender Ability Filtering",
    type: "fix",
    scopes: ["combat-lab"],
    summary:
      "The Defender panel previously listed every target defense from /api/meta/target-defenses regardless of which champion was selected — picking Aatrox would still surface Alistar R, Warwick E, Barrier, Sterak's, etc. Defenses are now classified per-champion using the backend `champion` / `champions` fields when present and otherwise inferred from the defense `name` / `label` / `active_name` (e.g. `target_alistar_r`, `target_defense_warwick_e`, 'Alistar R — Unbreakable Will'). Champion-specific abilities are only shown for the currently selected defender; generic defenses (Barrier, Sterak's, Shieldbow, generic shield / DR / resist modifiers, anything that can't be tied to a champion) now live inside a collapsed 'Advanced Generic Defenses' section.",
    details: [
      "New helpers: normalizeName(), inferDefenseChampion(), classifyDefenses() — case/punctuation-insensitive matching, longest champion names tried first to avoid 'Ahri' colliding with 'Aurelion'.",
      "Champion section is hidden in Custom Target Dummy mode; the Advanced Generic Defenses section is still available there (collapsed by default).",
      "Empty state when a selected defender has no implemented abilities: 'No defender abilities implemented for {Champion} yet.'",
      "Renamed 'Applicable Target Defenses' / 'Available defenses' to 'Defender Abilities'.",
      "Apply behaviour is unchanged — still calls /api/combat-lab/active, persists returned state, updates Active Defender Effects and feeds forward into subsequent attacks. Combat payloads, diagnostics and backend untouched.",
    ],
    files: ["src/pages/CombatLab.tsx", "src/lib/lol-changelog.ts"],
    routes: ["/combat-lab"],
  },
  {
    timestamp: "2026-06-21T14:00:00Z",
    title: "Quiz: Daily Challenge + Ranked hero, richer progression",
    type: "feature",
    scopes: ["quiz"],
    summary:
      "Reframed the Quiz home around two new progression heroes plus deeper rank, knowledge and achievement context — without redesigning the page or removing any existing system. The Featured Daily Challenge card is now the primary CTA (questions remaining, XP bonus, daily streak, completion status, Play Now). A Featured Ranked Quiz card lives directly below it with the current rank crest, placement-matches remaining, estimated XP gain/loss and a ranked queue button. The rank progress card now shows a larger current crest, the next rank crest, XP remaining to the next rank, percentage and a transient '+N XP' indicator after answers. Knowledge Breakdown's empty state lists total categories / total questions available, highlights new categories and recommends one to start. Achievement tiles now reveal mini progress bars, completion percentage and an XP reward chip on locked entries. Set cards picked up game-mode identity (category icon, question count, difficulty stars, mastery % and a 'New' badge for untouched modes).",
    details: [
      "New components: QuizDailyChallengeCard, QuizRankedQueueCard.",
      "Frontend-only mock layer at src/lib/quiz/featured-mock.ts persists daily challenge progress and recent XP gain in localStorage; resets per UTC day; streak rolls forward when the previous day was completed and breaks on a missed day.",
      "QuizProfileCard: larger current crest, next-rank crest chevron, xp_to_next label, recent +XP badge tied to the last submitAnswer response.",
      "QuizKnowledgeCard: empty state shows category/question counts, lists recently added categories (Item Exact Stats, Item Components, Item Builds Into, Champion Cooldowns, Summoner Cooldowns) and a recommended starting category.",
      "QuizAchievementsCard: locked tiles render a Progress bar, '{progress}/{goal} · %' text and a +XP reward chip when available.",
      "Quiz mode cards (QuizModeCard): category-themed icon, question count badge, ★ difficulty bucket from question count, mastery % from categoryStats overlap, 'New' chip when untouched.",
      "All new states are mock/local — no backend changes; replace featured-mock with real endpoints when the API ships.",
    ],
    files: [
      "src/pages/Quiz.tsx",
      "src/components/quiz/QuizDailyChallengeCard.tsx",
      "src/components/quiz/QuizRankedQueueCard.tsx",
      "src/components/quiz/QuizProfileCard.tsx",
      "src/components/quiz/QuizKnowledgeCard.tsx",
      "src/components/quiz/QuizAchievementsCard.tsx",
      "src/lib/quiz/featured-mock.ts",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/quiz"],
  },
  {
    timestamp: "2026-06-21T13:00:00Z",
    title: "Combat Lab: Champion Asset Manifest Profiles",
    type: "ui",
    scopes: ["combat-lab"],
    summary:
      "Combat Lab's Attacker and Defender Profile cards now pull champion art from the same Railway champion asset manifest used by the LoL Hub (GET ${VITE_COMBAT_API_URL}/api/assets/champions) instead of relying only on the legacy champion-images Supabase bucket. Each card resolves the image in priority order — selected-skin splash → selected-skin loading → default splash → default loading → champion icon → champion-images bucket fallback → compact placeholder — and the bucket is preserved as a fallback for admin-uploaded overrides. Compact skin selectors were added to both profile cards (visual preview only, never sent to the combat backend).",
    details: [
      "useChampionAssets extended with getChampionIcon(manifest, name, skinKey?), getChampionSkins(manifest, name), and skinKey overloads on getChampionSplash / getChampionLoading.",
      "ChampionAsset type gained an optional skins map keyed by skin id ({ splash?, loading?, icon?, label? }) for forward-compatibility with backend skin manifests.",
      "ChampionProfile now resolves manifest art first and only loads the champion-images bucket as a fallback; icon-only fallback is rendered with object-contain padding to avoid a stretched look.",
      "Profile image area is now compact (min-h 160 / max-h 220) so the versus header stays tight; admin upload + remove flow is unchanged.",
      "Attacker and Defender skin selections persist in localStorage as combat-lab:attacker-skin / combat-lab:defender-skin; auto-reset to 'default' when the new champion doesn't expose the previously-selected skin.",
      "Defender skin selector is hidden in Custom Target Dummy mode (and the dummy fallback profile is shown instead). Skin choice never reaches /api/combat-lab/* payloads — stats, items, runes and combat results are unaffected.",
    ],
    files: [
      "src/components/combat-lab/ChampionProfile.tsx",
      "src/hooks/useChampionAssets.ts",
      "src/pages/CombatLab.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/combat-lab"],
  },
  {
    timestamp: "2026-06-21T12:00:00Z",
    title: "Combat Lab: Attacker and Defender Champion Profiles",
    type: "ui",
    scopes: ["combat-lab"],
    summary:
      "Split the single Champion Profile card into two side-specific profiles: an Attacker Profile inside the Attacker column and a Defender Profile inside the Defender column. Both render the champion's stored image (via the existing champion-images storage system) along with the champion name, selected level and a short item summary, so each side of the versus layout has its own visual identity.",
    details: [
      "Reused the existing ChampionProfile component with new optional props (role, level, items, emptyMessage) instead of duplicating logic.",
      "Attacker Profile uses the attacker's champion / LEVEL / items.",
      "Defender Profile uses the defender's champion / target level / target items only when Defender Mode = Champion Defender.",
      "Defender Profile shows a 'Custom Target Dummy active' fallback when the dummy mode is selected, and 'Legacy target profile active' for the compat path.",
      "Removed the duplicated secondary-row Champion Profile; Live Stats now spans the full width below the versus grid.",
      "Champion image source unchanged (champion-images bucket via signed URLs) — no new backend requirements.",
    ],
    files: [
      "src/pages/CombatLab.tsx",
      "src/components/combat-lab/ChampionProfile.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/combat-lab"],
  },
  {
    timestamp: "2026-06-21T08:00:00Z",
    title: "Combat Lab: Runtime State Visualization (Phase 3)",
    type: "feature",
    scopes: ["combat-lab"],
    summary:
      "Surface the backend's target modifier engine, timed effects and combat state persistence inside the Versus layout. The attacker and defender columns now show 'Active Effects' chip rails (Shield, DR %, Phys/Magic DR, Alistar R / Warwick E / Trundle R, Conqueror, Lethal Tempo, Silver Bolts, Plasma, Blight, Rageblade, etc.) sourced from state.states + runtime stats, with optional durations. A new Damage Mitigation card on the defender breaks incoming → shield absorbed → DR prevented → final damage taken. The Combat Timeline is replaced with a human-readable Combat Feed (e.g. 'Alistar activates Unbreakable Will', 'Shield absorbs 200 damage', 'Damage reduced by 75%', 'Basic Attack deals 320 Physical damage'); the raw timeline, runtime state JSON, final state and developer panels are now Dev Mode only. Target defense IDs (target_alistar_r, target_warwick_e, …) are rendered as 'Champion Ability — Name' labels in the defender Apply list and feed.",
    details: [
      "ActiveEffectsPanel: pattern-matched extraction from attacker_stats + state.states; renders nothing when no effects exist.",
      "MitigationBreakdownPanel: aggregates incoming_damage / shield_absorbed / damage_reduction_amount / final_damage from events; hidden when no mitigation data.",
      "ReadableCombatFeed: last 30 events humanized via humanizeEvent(); shield, DR, active casts, stat changes and damage all have dedicated phrasings.",
      "prettifyDefenseName(): backend label preferred, then DEFENSE_LABEL_MAP overrides, then 'Champion Ability' fallback.",
      "Dev Mode now gates SandboxTimeline, RuntimeStatePanel, FinalStatePanel, DeveloperPanel, Engine Coverage and Champion Confidence; normal users only see the readable summaries.",
      "Preserved: target champion mode, custom dummy mode, apply defense actions, target defense preview, runtime state persistence, basic attack flow, champion actions, diagnostics page.",
    ],
    files: ["src/pages/CombatLab.tsx", "src/lib/lol-changelog.ts"],
    routes: ["/combat-lab"],
  },
  {
    timestamp: "2026-06-20T08:00:00Z",
    title: "Combat Lab: Versus layout (Attacker vs Defender)",
    type: "ui",
    scopes: ["combat-lab"],
    summary:
      "Reorganized Combat Lab into a three-column versus simulator: Attacker Champion on the left, a Combat panel with a VS divider and action buttons in the center, and a Defender Champion panel on the right. The defender panel introduces a clearer Champion Defender / Custom Target Dummy mode toggle and exposes the new backend target-system fields (defender stats, target shield, damage reduction, applicable target defenses).",
    details: [
      "Top layout is now 3 columns on desktop (Attacker / Combat / Defender) and stacks vertically on mobile.",
      "Combat center shows '{Attacker} VS {Defender}' header plus Basic Attack, target-scope picker, champion actions and Reset button.",
      "Defender panel supports two modes: Champion Defender (champion / level / items / runes) and Custom Target Dummy (HP / Armor / MR / Shield / DR %).",
      "Custom Target Dummy drives target_stats { HP, ARMOR, MR } on every action request.",
      "When a Champion Defender has matching target defenses from /api/meta/target-defenses, the panel lists them with an Apply button that calls /api/combat-lab/active and persists returned state into the sandbox.",
      "Defender stat window (Target Runtime Summary) renders HP / Armor / MR / Shield / DR / Phys DR / Magic DR from backend target_stats + target_debug.",
      "Legacy Target Profile dropdown moved into Developer Overrides — target_profile field is still sent for backend compatibility.",
      "Dev-mode Target Defense Preview retained for before/after inspection.",
      "ChampionProfile and LiveStatsPanel moved into a secondary row below the versus header.",
    ],
    files: ["src/pages/CombatLab.tsx", "src/lib/lol-changelog.ts"],
    routes: ["/combat-lab"],
  },
  {
    timestamp: "2026-06-20T07:00:00Z",
    title: "Quiz: new category badges + session breakdown + missed-question review",
    type: "feature",
    scopes: ["quiz"],
    summary:
      "Brought the League Quiz frontend in sync with the backend's expanded question library (4,000+ questions). Added distinct themed category badges for Item Exact Stats, Item Components, Item Builds Into, Item Build Paths, Champion Ability Cooldowns, and Summoner Spell Cooldowns. Cooldown questions get an extra 'Cooldown' chip; Exact Stat questions display the stat being tested via the metadata stat_label / stat_name. Item rendering now resolves item_name from item_name, parent_item_name, or component_item_name and asset_path metadata so build-graph questions show the source item icon. Quiz sessions now track per-question answers locally; the results screen shows a per-category accuracy breakdown (best / weakest highlighted) and a 'Questions to Review' list of the session's missed questions with the chosen vs correct answer and explanation. Quiz diagnostics gains a 'Recognized Categories' panel that renders synthesized metadata samples for the new categories to confirm the UI recognizes them without requiring live backend data. Existing XP, rank progression, achievements, image-bearing answers, champion/item/rune/summoner visuals, and admin tooling are unchanged.",
    details: [
      "CATEGORY_STYLE_MAP + getCategoryStyle() with snake_case + Title Case normalization and partial-match fallbacks.",
      "Active question header replaced plain outline badge with iconified themed badge + optional Cooldown / Stat chips.",
      "Item visual branch detects component_item_* and parent_item_* metadata so build-graph questions still light up the item card.",
      "SessionAnswer[] state captures per-question outcomes; reset on set selection / play again.",
      "SessionBreakdown card lists per-category correct/total + accuracy with Best / Needs Work callouts.",
      "SessionReviewList card lists missed questions with chosen vs correct answer and the backend explanation.",
      "QuizDiagnostics adds RecognizedCategoriesPanel rendering item_exact_stats, item_components, item_builds_into, champion_ability_cooldowns, and summoner_spell_cooldowns sample metadata.",
    ],
    files: [
      "src/pages/Quiz.tsx",
      "src/pages/QuizDiagnostics.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/quiz", "/quiz/diagnostics"],
  },
  {
    timestamp: "2026-06-20T06:30:00Z",
    title: "Combat Lab Target Setup panel + target champion entity support",
    type: "feature",
    scopes: ["combat-lab"],
    summary:
      "Combat Lab now exposes a non-invasive Target Setup panel in the Interactive Sandbox left column. Users can flip between the existing Target Profile mode (unchanged) and a new Target Champion mode that lets them pick a target champion, level (default 18), items, and runes. When Target Champion mode is active, /api/combat-lab/basic-attack and /api/combat-lab/active payloads include target_champion_name / target_level / target_item_names / target_rune_names; target_stats is still sent as a safe fallback for older backend paths. Responses with target_stats / target_debug now drive a Target Runtime Summary card (mode, target entity champion name, HP / ARMOR / MR / TARGET_SHIELD / TARGET_DAMAGE_REDUCTION_PERCENT / TARGET_PHYSICAL_DAMAGE_REDUCTION_PERCENT / TARGET_MAGIC_DAMAGE_REDUCTION_PERCENT). Dev Mode adds a compact Target Defense Preview panel wired to /api/combat-lab/target-defense-preview that shows before/after ARMOR / MR, shield, DR%, and duration, without changing live combat execution semantics.",
    details: [
      "New Target Setup state (targetMode, targetChampionName, targetLevel, targetItemNames, targetRuneNames) persisted under combat-lab:target-setup.",
      "Sandbox sendStep skips the 'pick target profile' guard when targetMode === 'target_champion' and instead requires a target champion.",
      "TargetRuntimeSummary renders only fields actually present on the response.",
      "Target Defense Preview is dev-mode-only and does not auto-apply defense state into the running sandbox.",
      "Rotation Simulator, target profile flow, Damage Breakdown, Runtime State, Final State, and Diagnostics page are all unchanged.",
    ],
    files: [
      "src/pages/CombatLab.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/combat-lab"],
  },
  {
    timestamp: "2026-06-20T05:30:00Z",
    title: "LoL Hub 'Portrait' popout is now hover-only with outward slide",
    type: "ui",
    scopes: ["hub"],
    summary:
      "The Portrait popout style on /lol no longer sits permanently outside each HexZipperCard. At rest the portrait is hidden (opacity 0, tucked against the outer card edge); on hover it fades in and slides outward — right cards slide further right, left cards slide further left — over a 700ms ease-out transition. Splash and Cutout behavior unchanged.",
    details: [
      "HexZipperCard portrait branch: rest opacity-0 + translate-x-0, group-hover opacity-100 + translate-x-[±50%].",
      "Slide direction mirrors the card alignment so the portrait always exits the outer edge of the page.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-20T05:00:00Z",
    title: "LoL Hub popout toggle gains third 'Portrait' option",
    type: "feature",
    scopes: ["hub"],
    summary:
      "Added a third option to the admin-only LoL Hub popout style toggle. 'Portrait' renders the full champion loading-art portrait jutting past the OUTER edge of each HexZipperCard (matching the original Akali-on-Combat-Lab look), sitting behind the border layer with a soft cyan glow, an inward mask-fade so the rectangle blends into the hex silhouette, and a subtle hover scale + brightness bump. Splash remains the default; Cutout (inner-edge transparent slide) is unchanged. Invalid stored values still fall back to 'splash'.",
    details: [
      "HexPopoutStyle extended to 'cutout' | 'splash' | 'portrait'.",
      "HexZipperCard adds a portrait branch: aspect-[3/4], h-[360px] / h-[440px] flagship, translated ~50% past the outer card edge, object-cover with center-top focus, mask-image fade on the card-facing edge.",
      "LolPopoutStyleToggle now has three segmented buttons (Splash / Cutout / Portrait); same optimistic update + toast revert on app_settings write failure.",
      "LolHub validates 'portrait' as an allowed app_settings value and passes the splash/loading URL for both splash and portrait styles.",
      "Shield fallback retained when the champion manifest has no asset.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/components/lol/LolPopoutStyleToggle.tsx",
      "src/pages/LolHub.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-20T04:00:00Z",
    title: "Admin toggle: switch LoL Hub champion popout style (Splash ↔ Cutout)",
    type: "feature",
    scopes: ["hub"],
    summary:
      "Added an admin-only floating pill on /lol that toggles the HexZipperCard champion artwork between the original rectangular splash treatment (now the default) and the transparent cutout popout. The choice is persisted globally in app_settings under the `lol_hub_popout_style` key so every visitor sees the selected style. Default resolves to `splash` when no row exists or the stored value is invalid. The toggle optimistically updates the UI and reverts with an error toast if the write fails. Non-admins never see the control.",
    details: [
      "New component: src/components/lol/LolPopoutStyleToggle.tsx — segmented pill fixed bottom-right, gated by has_role(admin|master_admin) RPC.",
      "HexZipperCard gained a popoutStyle prop ('splash' | 'cutout'). Splash branch renders the manifest's splash (or loading fallback) as an absolutely-positioned object-cover image behind the card content, clipped by the existing hex Link, with a directional mask, low opacity at rest, and a subtle hover zoom + opacity ramp.",
      "useChampionAssets exports a new getChampionSplash(manifest, name) helper returning splash ?? loading from the Railway manifest.",
      "LolHub reads app_settings.lol_hub_popout_style on mount (default 'splash'), resolves the correct image per style, and passes popoutStyle into every card.",
      "Card icon, text, and arrow promoted to z-10 so splash art sits cleanly behind them inside the hex clip.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/components/lol/LolPopoutStyleToggle.tsx",
      "src/hooks/useChampionAssets.ts",
      "src/pages/LolHub.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-20T03:00:00Z",
    title: "LoL Hub champion popouts emerge from the inner card edge",
    type: "ui",
    scopes: ["hub"],
    summary:
      "Repositioned the HexZipperCard champion cutouts so they emerge from the INNER side of each zipper card (toward page center) instead of the far page edges. Right-aligned cards now anchor the popout to their left edge and slide it further left on hover; left-aligned cards mirror that toward the right. Cutouts are taller (h-[460px] normal, h-[580px] flagship) and 55–75% of the champion is visible on hover so the effect reads clearly into the central zig-zag lane. Cyan radial glow, drop-shadow, pointer-events-none, opacity 0→1 hover fade, and the upward lift are preserved. Railway /api/assets/champions manifest, useChampionAssets, cutout-only behavior, shield fallback, zipper stagger, hover translation, border pulse, and mobile fallback are unchanged.",
    details: [
      "HexZipperCard: popout anchor flipped to inner edge (left-0 for right cards, right-0 for left cards); translateX now moves toward page center.",
      "Rest translate ~10% (plus per-card cutoutOffsetPct), hover translate ~55% so 55–75% of the cutout is visible past the card edge.",
      "Champion is mirrored when sitting on the right side of a left-aligned card so it faces toward the card body.",
      "Heights bumped: normal h-[460px], flagship h-[580px] (was 400/520). object-contain preserved — no PNG cropping.",
      "Card body stays at z-20 above the cutout (z-0). Cyan/blue radial glow behind champion retained.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-20T02:00:00Z",
    title: "LoL Hub champion popouts restored to hover-only",
    type: "fix",
    scopes: ["hub"],
    summary:
      "Fixed the HexZipperCard champion cutouts so they are hidden at rest and only appear on hover. Rest opacity is now 0 (was 0.7) so the character stays tucked behind the card edge until the user hovers, at which point it slides outward to ~50-70% visible, lifts slightly, and fades to full opacity. All other behavior is preserved: Railway cutout manifest, per-champion offsets, object-contain, z-index layering, shield fallback, zipper layout, card sizes, hover translation, and animated Hextech border pulse.",
    details: [
      "HexZipperCard popout rest opacity changed from opacity-70 to opacity-0; group-hover:opacity-100 unchanged.",
      "Rest and hover transforms (18% / 32% outward plus per-card cutoutOffsetPct) and translateY(-12px) lift on hover remain the same.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-20T01:00:00Z",
    title: "LoL Hub champion cutout positioning polish",
    type: "ui",
    scopes: ["hub"],
    summary:
      "Tuned the HexZipperCard champion popouts so cutouts feel attached to their card instead of floating off the page edge. At rest the cutout overlaps the card by ~60-65% (35-50% visible) at 70% opacity; on hover it slides outward to ~50-70% visible and fades to full opacity. Popouts are taller (h-400px / h-520px flagship) and per-champion horizontal offsets balance Akali, Ryze, Jinx, Draven and Viktor individually. Card body stays at z-20 above the cutout (z-0); zipper stagger, hover translation and animated Hextech border pulse unchanged. object-contain preserved — no PNG cropping.",
    details: [
      "HexZipperCard: new cutoutOffsetPct prop; rest transform translates 18% outward (plus per-card offset) and hover transform translates 32% outward via a CSS var consumed by .group:hover > .hex-popout in index.css.",
      "Heights: normal h-[400px], flagship h-[520px] (was 300/420).",
      "Rest opacity raised from 0 to 0.7 so the character is visible before hover; hover restores full opacity and adds -translateY(12px) lift.",
      "Per-champion offsets in LolHub ZIPPER_FEATURES: Akali -4, Ryze -2, Jinx 0, Draven +2, Viktor -2.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/pages/LolHub.tsx",
      "src/index.css",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-20T00:00:00Z",
    title: "LoL Hub champion popouts use Railway champion asset manifest",
    type: "fix",
    scopes: ["hub"],
    summary:
      "HexZipperCard hover popouts now render the transparent champion cutout PNGs from the Combat/Railway backend's GET /api/assets/champions manifest instead of rectangular splash/loading art or the old champion-images Supabase bucket. Relative manifest paths (e.g. assets/champions/Akali/cutouts/Akali_Cutout.png) are resolved against VITE_COMBAT_API_URL. Only the `cutout` field is used for the hub — icon/splash/loading are ignored here. Shield silhouette fallback is preserved when a cutout is missing or the image fails to load. Mapping unchanged: Combat Lab → Akali, League Quiz → Ryze, LoL Tier List → Jinx, Swipe Champions → Draven, League Docs → Viktor.",
    details: [
      "useChampionAssets now fetches `${VITE_COMBAT_API_URL}/api/assets/champions` directly (default https://web-production-83e53.up.railway.app) instead of invoking the assets-champions edge function.",
      "Added resolveAssetUrl() helper; getChampionCutout() returns an absolute URL to the transparent cutout PNG.",
      "HexZipperCard popout keeps object-contain, transparent PNG alpha, and stays layered behind the card (z-0) with the card body above (z-20). Zipper stagger, hover translation, and traveling Hextech border pulse unchanged.",
    ],
    files: [
      "src/hooks/useChampionAssets.ts",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-18T01:00:00Z",
    title: "LoL Hub zipper polish — champion popout, stagger, border pulse",
    type: "ui",
    scopes: ["hub"],
    summary:
      "Second pass on the /lol Hextech Zipper. Champion popout always renders (with a glowing shield silhouette fallback when no champion image is configured), is larger (300px / 420px flagship) and slides further outside the card edge on hover. Cards translate ~24px outward on hover. The animated Hextech border is now a discrete cyan light pulse traveling around the clipped edge instead of a uniform glow. Cards are laid out as a true zipper: single column, alternating self-end / self-start at 72–78% width with a slight negative top margin for zig-zag overlap. Mobile untouched.",
    details: [
      "HexZipperCard: champion popout container is always mounted; renders <img> when useChampionImage resolves a URL, otherwise a radial-glow + Shield icon fallback. onError hides only the image, the popout container remains.",
      "Popout sizes bumped to h-[300px] (h-[420px] flagship) and slides to 45% outside the card edge on hover.",
      "Card hover translate increased from 8px to 24px; scale from 1.015 to 1.02.",
      "Border pulse: replaced the soft conic sweep with a narrow bright cyan-to-white spike inside .hex-border-pulse, rotating every 2.4s — reads as a single moving light bead around the hex border instead of a uniform brighten.",
      "Layout switched from 2-col grid to flex column with alternating self-end/self-start and -mt-4 stagger so the eye follows a zig-zag.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/pages/LolHub.tsx",
      "src/index.css",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-18T00:00:00Z",
    title: "LoL Hub Hextech Zipper layout (desktop-first)",
    type: "ui",
    scopes: ["hub"],
    summary:
      "Reworked the /lol homepage on desktop into a 'Hextech Zipper' — alternating left/right clipped hex-shape feature cards under the hero banner. Combat Lab is the flagship top-right card, followed by League Quiz (left), LoL Tier List (right), Swipe Champions (left), and League Docs (right). On hover, each card slides toward its edge, a cyan Hextech border light travels around the clipped border, and a champion cutout slides out from behind the card's outer edge. Mobile still falls back to the existing stacked tile list. Routes, icons, and downstream sections (News & Blog) are unchanged.",
    details: [
      "New component src/components/lol/HexZipperCard.tsx — clipped-corner card with dark navy body, gold accents, cyan Hextech border layer, inner glow, animated traveling border light, hover slide + scale, and a champion popout image layered behind the card.",
      "Champion popout uses a new src/hooks/useChampionImage.ts helper that reads the existing champion-images Supabase storage bucket (keyed by champion name) — same asset system Combat Lab already uses. No new image system, no hardcoded external URLs. Image errors hide the popout gracefully.",
      "Champion mapping (easy to adjust in ZIPPER_FEATURES): Combat Lab → Jinx, League Quiz → Ryze, LoL Tier List → Azir, Swipe Champions → Draven, League Docs → Viktor.",
      "Hex clip-path applied to both the outer cyan border layer and the inner card body; flagship variant doubles up icon and title sizing for Combat Lab.",
      "Added .hex-border-light keyframes + conic-gradient animation to src/index.css.",
      "Desktop (md+) uses the new 2-column zipper grid; mobile keeps the original HubTile stack so this turn does not regress mobile.",
    ],
    files: [
      "src/pages/LolHub.tsx",
      "src/components/lol/HexZipperCard.tsx",
      "src/hooks/useChampionImage.ts",
      "src/index.css",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-17T00:00:00Z",
    title: "Quiz champion choice visuals (image-bearing answer choices)",
    type: "ui",
    scopes: ["quiz"],
    summary:
      "Quiz answer choices now support object form { label, image_path, champion_name } and render the image inside each choice button. For champion-comparison prompts like 'Which champion is ranged?' / 'Which is melee?', the single main champion icon is suppressed when choices carry images and the question itself has no image_path, so the answer is no longer revealed by the top icon. Plain string choices and existing item/rune/summoner/single-champion visuals are unchanged.",
    details: [
      "Added getChoiceImage() helper and QuizChoiceObject type alongside getChoiceLabel().",
      "Choices with image_path resolve via resolveQuizAssetUrl and render as a Hextech-gold framed thumbnail above the label inside the answer Button.",
      "Answer grid switches to a 2-column layout when any choice has an image, otherwise stays single-column.",
      "When choicesHaveImages && !question.image_path, the main visual block (champion icon / splash framing) is hidden to avoid revealing the correct answer.",
      "Item / rune / summoner / direct champion question visuals preserved.",
    ],
    files: ["src/pages/Quiz.tsx", "src/lib/lol-changelog.ts"],
    routes: ["/quiz"],
  },
  {
    timestamp: "2026-06-16T15:30:00Z",
    title: "League Quiz Achievements panel (Quiz + Diagnostics)",
    type: "feature",
    scopes: ["quiz"],
    summary:
      "Added a Hextech-styled Achievements panel to /quiz (rendered below the Knowledge Breakdown) and a compact variant with a collapsible raw JSON viewer to /quiz/diagnostics. Both surfaces hit the new GET /api/quiz/achievements/{user_id} endpoint using the same user id already used for quiz progress (auth user or 'anonymous').",
    details: [
      "New API helper quizApi.getAchievements(userId) and types QuizAchievement / QuizAchievementsResponse in src/lib/quiz/api.ts. Response is normalized so backends that return either { achievements: [] } or split { unlocked: [], locked: [] } both work.",
      "New component src/components/quiz/QuizAchievementsCard.tsx: unlocked tiles first then locked, each tile shows icon (resolveQuizAssetUrl), title, description, unlocked badge / lock badge, unlocked_at date when present, and optional progress/goal for locked items.",
      "Unlocked tiles use a gold (#c9a84c) border, inner glow and subtle gold top-edge highlight with a Trophy icon; locked tiles render dimmed and grayscale with a Lock icon.",
      "Layout: compact grid on desktop (sm:2 cols, lg:3 cols) and stacked on mobile. A `compact` prop renders the tighter diagnostics layout (sm:2 cols, no card chrome).",
      "Quiz page wiring: loadAchievements() runs on mount and re-runs whenever a submitted answer returns unlocked_achievements, so the panel refreshes immediately after an unlock.",
      "Diagnostics: new 'Achievements (anonymous)' panel above the Debug Summary with the QuizAchievementsCard in compact mode plus a collapsible Raw JSON viewer.",
      "Existing quiz, reports, progress, visuals, diagnostics, and admin behavior left untouched.",
    ],
    files: [
      "src/components/quiz/QuizAchievementsCard.tsx",
      "src/lib/quiz/api.ts",
      "src/pages/Quiz.tsx",
      "src/pages/QuizDiagnostics.tsx",
    ],
    routes: ["/quiz", "/quiz/diagnostics"],
  },
  {
    timestamp: "2026-06-16T15:10:00Z",
    title: "League Docs auto-update convention + recent LoL changes logged",
    type: "docs",
    scopes: ["docs", "quiz", "theme", "hub", "tier-list", "combat-lab"],
    summary:
      "Documented the rule that every future LoL-surface change must prepend a LolChangeEntry to src/lib/lol-changelog.ts in the same turn, and backfilled entries for the Hextech ambience overlay, the transparent-backing pass across LoL pages, and the multiple League Quiz visual upgrades (themed category frames, animated champion splashes, XP/streak/achievement rewards).",
    files: ["src/lib/lol-changelog.ts"],
    routes: ["/lol/docs"],
  },
  {
    timestamp: "2026-06-16T15:00:00Z",
    title: "League Quiz visual upgrade — themed category frames & richer rewards",
    type: "ui",
    scopes: ["quiz"],
    summary:
      "Upgraded /quiz visuals now that the backend ships clean asset paths for items, runes, summoner spells, champion icons, champion splashes and rank icons. Every image is resolved through resolveQuizAssetUrl, and each question category gets a distinct themed frame.",
    details: [
      "Champion questions: splash opacity raised to ~0.5, deeper navy-to-black gradient overlay, intensified Ken Burns pan/zoom with saturate(1.15)/contrast(1.08), champion name beneath the icon with a gold-light text shadow.",
      "Items: gold-bordered square frame with inset shadows, item name shown beneath.",
      "Runes: circular frame with a purple/blue conic-gradient ring and rune name.",
      "Summoner spells: cyan-to-blue gradient border with a spell-like glow.",
      "Answer reveal block: handles `rank` as an object (uses small_icon_path), shows XP gained, current streak (e.g. '🔥 3 streak'), and fires toasts for any `unlocked_achievements` returned by the answer API.",
      "QuizProfileCard prioritizes the rank `large_icon_path`, enlarges the crest to h-24 w-24, and adds a scaling entrance animation.",
    ],
    files: [
      "src/components/quiz/QuizProfileCard.tsx",
      "src/lib/quiz/api.ts",
      "src/pages/Quiz.tsx",
    ],
    routes: ["/quiz"],
  },
  {
    timestamp: "2026-06-16T14:30:00Z",
    title: "Transparent backing on all LoL pages so Hextech theme shows through",
    type: "theme",
    scopes: ["theme", "hub", "tier-list", "quiz", "docs"],
    summary:
      "Removed opaque `min-h-dvh bg-background` wrappers from LolHub, LolTierList, Quiz and LolDocumentation, and switched headers / hub tiles / methodology & FAQ panels / role tabs / champion question cards to semi-transparent surfaces (bg-card/70, gradient/90 with backdrop-blur-sm) so the HextechAmbience layer is visible behind every LoL page. Combat Lab was intentionally NOT modified.",
    files: [
      "src/pages/LolDocumentation.tsx",
      "src/pages/LolHub.tsx",
      "src/pages/LolTierList.tsx",
      "src/pages/Quiz.tsx",
    ],
    routes: ["/lol", "/lol/tier-list", "/quiz", "/lol/docs"],
  },
  {
    timestamp: "2026-06-16T14:00:00Z",
    title: "Hextech ambience overlay across all LoL pages",
    type: "theme",
    scopes: ["theme", "hub", "tier-list", "quiz", "combat-lab"],
    summary:
      "Added a full-viewport decorative HextechAmbience overlay rendered inside Layout whenever the current route is a LoL section. Provides floating runes, an arctic mist band, and ornate gold corner brackets to make every LoL page feel like a League client surface.",
    details: [
      "New component src/components/HextechAmbience.tsx with Rune sub-component supporting hex, gem, cross, bolt and diamond SVG symbols, each drifting via hextech-float keyframes with unique size/delay/duration.",
      "Arctic mist band uses radial gradients + blur via hextech-mist keyframes.",
      "Corner brackets are gold-stroked SVGs with gold-light circles.",
      "All layers use pointer-events-none and z-[5] so they never intercept UI input.",
      "Honors prefers-reduced-motion: animations disabled via media query in index.css.",
      "Rendered from Layout.tsx alongside Navbar/ThemeOverlay inside the isLolSection block.",
    ],
    files: [
      "src/components/HextechAmbience.tsx",
      "src/components/Layout.tsx",
      "src/index.css",
    ],
    routes: ["/lol", "/lol/tier-list", "/lol/docs", "/combat-lab", "/quiz"],
  },
  {
    timestamp: "2026-06-16T13:40:00Z",
    title: "Champion-question polish: Ken Burns splash, Hextech icon frame, staggered answers",
    type: "ui",
    scopes: ["quiz"],
    summary:
      "Champion questions in /quiz now feel closer to a premium League experience: slow Ken Burns pan/zoom on the splash background, dark gradient overlay layered above the splash instead of pure opacity, champion name beneath the icon when metadata.champion_name is present, entrance animations (splash fade-in, icon scale/fade-in, staggered upward answer reveal), and a stronger Hextech gold border + inner glow + drop shadow on the icon frame. Item/rune/summoner/rank visuals preserved.",
    files: ["src/index.css", "src/pages/Quiz.tsx"],
    routes: ["/quiz"],
  },
  {
    timestamp: "2026-06-16T13:20:00Z",
    title: "League Quiz champion-question visuals wired to backend metadata",
    type: "feature",
    scopes: ["quiz"],
    summary:
      "Quiz champion questions now consume metadata.champion_icon_path, champion_splash_path, champion_loading_path and asset_path from the backend (all routed through resolveQuizAssetUrl). champion_splash_path becomes a low-opacity card background with a dark gradient overlay for readability; champion_icon_path is the primary visual, falling back to image_path then asset_path. Card adopts deep-navy + subtle gold Hextech border styling. Item / rune / summoner / rank flows untouched. Combat Lab not modified.",
    files: ["src/pages/Quiz.tsx"],
    routes: ["/quiz"],
  },
  {
    timestamp: "2026-06-16T13:00:00Z",
    title: "League documentation page added to LoL hub",
    type: "docs",
    scopes: ["docs", "hub"],
    summary:
      "Added a new League Docs page at /lol/docs that records every Lovable change made to LoL surfaces with timestamps, types, scopes, files and routes. Includes search, filter, sort and per-entry / full-log copy-to-clipboard buttons designed to paste into ChatGPT.",
    details: [
      "New tile 'League Docs' added to the LoL hub action grid (between Tier List and the news strip).",
      "Toolbar: search input (left), Type dropdown, Scope dropdown, Sort dropdown (Newest / Oldest / Title A-Z).",
      "Each entry card shows timestamp (local + relative), type pill, scope pills, summary, details list, files list, routes list, and a 'Copy entry' button that copies a Markdown block.",
      "Sticky top action row has 'Copy all (filtered)' and 'Copy full log' buttons that emit a single Markdown document optimized for pasting into ChatGPT.",
      "Page reuses the LoL theme (gold #c9a84c accents on the dark blue gradient hub background) and the floating back-to-hub button from Layout.",
    ],
    files: [
      "src/pages/LolDocumentation.tsx",
      "src/lib/lol-changelog.ts",
      "src/lib/route-prefetch.ts",
      "src/App.tsx",
      "src/pages/LolHub.tsx",
    ],
    routes: ["/lol/docs", "/lol"],
  },
  {
    timestamp: "2026-06-16T12:40:00Z",
    title: "League Hub back button on all LoL sub-pages",
    type: "ui",
    scopes: ["navigation", "hub", "combat-lab", "quiz", "tier-list"],
    summary:
      "Added a fixed-position 'League Hub' back button that appears on every LoL sub-route (everything under /lol/*, /combat-lab/*, /quiz/*) but is hidden on the /lol hub itself.",
    details: [
      "Rendered from src/components/Layout.tsx, positioned fixed top-16 left-3 (md:left-4) at z-[55].",
      "Styling: gold border/text (#c9a84c), black/40 background with backdrop-blur, ArrowLeft icon from lucide-react, hover state lightens the border.",
      "Implemented as a react-router <Link to='/lol'> so navigation stays SPA-fast.",
    ],
    files: ["src/components/Layout.tsx"],
    routes: ["/lol/tier-list", "/combat-lab", "/quiz", "/quiz/admin", "/quiz/diagnostics", "/combat-lab/diagnostics"],
  },
  {
    timestamp: "2026-06-16T12:20:00Z",
    title: "Quiz Admin route protected behind AdminRoute",
    type: "security",
    scopes: ["quiz"],
    summary:
      "Wrapped /quiz/admin in <AdminRoute> so only users with the admin or master_admin role (validated server-side via the has_role RPC) can reach the quiz admin tools.",
    files: ["src/App.tsx"],
    routes: ["/quiz/admin"],
  },
  {
    timestamp: "2026-06-16T11:50:00Z",
    title: "LoL theme persists across refresh & theme switcher hidden",
    type: "theme",
    scopes: ["theme", "hub", "combat-lab", "quiz", "tier-list"],
    summary:
      "Fixed the LoL-inspired theme being stripped by the sitewide theme provider after a refresh, and hid the floating theme switcher entirely while inside any LoL section.",
    details: [
      "useSitewideTheme now early-returns when window.location.pathname matches /lol, /combat-lab or /quiz, so its className-cycle effect cannot remove theme-lol.",
      "Layout.tsx switched from useLayoutEffect to useEffect (with themeId in deps) so the LoL class is re-applied on every render after the provider runs.",
      "When leaving a LoL section the layout strips any leftover theme classes and re-applies theme-${visualThemeId}.",
      "FloatingThemeSwitcher is conditionally rendered only when !isLolSection.",
    ],
    files: [
      "src/components/Layout.tsx",
      "src/hooks/useSitewideTheme.tsx",
    ],
    routes: ["/lol", "/lol/tier-list", "/combat-lab", "/quiz"],
  },
  {
    timestamp: "2026-06-16T11:20:00Z",
    title: "LoLdle-inspired theme for all League pages",
    type: "theme",
    scopes: ["theme", "hub", "combat-lab", "quiz", "tier-list"],
    summary:
      "Disabled Mogsy sitewide themes on League pages and introduced a dedicated 'theme-lol' look inspired by LoLdle: deep navy/black background with gold (#c9a84c) accents and Hextech-style borders.",
    details: [
      "Hero gradient: from-[#0a1428] via-[#091428] to-[#0a0a1a] with blurred lol-icon backdrop.",
      "Accent color (#c9a84c) used on labels, hub tile icons, back button border, and tier-list badges.",
      "Theme class applied via Layout.tsx; CSS variables defined in src/index.css under .theme-lol.",
    ],
    files: [
      "index.html",
      "src/components/Layout.tsx",
      "src/index.css",
    ],
    routes: ["/lol", "/lol/tier-list", "/combat-lab", "/quiz"],
  },
  {
    timestamp: "2026-06-16T10:30:00Z",
    title: "Admin Diagnostics page for site-wide health checks",
    type: "feature",
    scopes: ["hub"],
    summary:
      "New /admin/diagnostics page that probes every route in Mogsy and reports load speed, status, console errors and other health metrics. Linked from the main Admin dashboard.",
    files: [
      "src/pages/AdminDiagnostics.tsx",
      "src/App.tsx",
      "src/lib/route-prefetch.ts",
      "src/pages/Admin.tsx",
      "src/pages/Leagues.tsx",
    ],
    routes: ["/admin/diagnostics"],
  },
  {
    timestamp: "2026-06-16T09:00:00Z",
    title: "LoL Hub launched with action tiles and news strip",
    type: "feature",
    scopes: ["hub"],
    summary:
      "Initial League of Legends hub at /lol. Tiles route to Combat Lab, League Quiz, Swipe LoL Champions and LoL Tier List. Below the tiles, the latest blog posts tagged 'League of Legends' render in a responsive grid.",
    details: [
      "Hero: gold 'Mogsy x LoL' eyebrow, page title 'League of Legends Hub', short tagline, lol-icon badge.",
      "Tile grid: 1 column on mobile, 2 columns md+, each tile has an icon chip on the left and ArrowRight that nudges on hover.",
      "News strip: 2-column on mobile up to 5-column on lg, sourced from useBlogList({ tag: 'League of Legends' }).",
    ],
    files: ["src/pages/LolHub.tsx", "src/App.tsx"],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-15T18:00:00Z",
    title: "LoL Tier List page",
    type: "feature",
    scopes: ["tier-list"],
    summary:
      "Standalone tier list page for the current patch at /lol/tier-list covering Top, Jungle, Mid, ADC and Support roles with S/A/B/C/D tier rows.",
    files: ["src/pages/LolTierList.tsx", "src/App.tsx"],
    routes: ["/lol/tier-list"],
  },
  {
    timestamp: "2026-06-15T15:00:00Z",
    title: "Combat Lab matchup simulator",
    type: "feature",
    scopes: ["combat-lab"],
    summary:
      "Combat Lab at /combat-lab lets users simulate champion matchups, theorycraft builds, and run damage tests. Data fetched from external Railway-hosted Combat API.",
    files: ["src/pages/CombatLab.tsx", "src/lib/combat-lab/api.ts"],
    routes: ["/combat-lab", "/combat-lab/diagnostics"],
  },
  {
    timestamp: "2026-06-15T15:00:00Z",
    title: "League Quiz game",
    type: "feature",
    scopes: ["quiz"],
    summary:
      "Quiz at /quiz tests champion knowledge, mechanics and trivia. Admin tools at /quiz/admin (admin-gated) and diagnostics at /quiz/diagnostics.",
    files: ["src/pages/Quiz.tsx", "src/pages/QuizAdmin.tsx", "src/pages/QuizDiagnostics.tsx", "src/lib/quiz/api.ts"],
    routes: ["/quiz", "/quiz/admin", "/quiz/diagnostics"],
  },
];

export const LOL_CHANGE_TYPES: LolChangeType[] = [
  "feature",
  "fix",
  "ui",
  "theme",
  "security",
  "refactor",
  "docs",
];

export const LOL_CHANGE_SCOPES: LolChangeScope[] = [
  "hub",
  "tier-list",
  "combat-lab",
  "quiz",
  "theme",
  "navigation",
  "docs",
];

/** Build a Markdown block for a single entry — optimized for pasting into ChatGPT. */
export function entryToMarkdown(e: LolChangeEntry): string {
  const lines: string[] = [];
  lines.push(`### ${e.title}`);
  lines.push(`- **When:** ${e.timestamp}`);
  lines.push(`- **Type:** ${e.type}`);
  lines.push(`- **Scopes:** ${e.scopes.join(", ")}`);
  if (e.routes?.length) lines.push(`- **Routes:** ${e.routes.join(", ")}`);
  if (e.files?.length) lines.push(`- **Files:** ${e.files.join(", ")}`);
  lines.push("");
  lines.push(e.summary);
  if (e.details?.length) {
    lines.push("");
    for (const d of e.details) lines.push(`- ${d}`);
  }
  return lines.join("\n");
}

/** Build a full Markdown document from a list of entries. */
export function entriesToMarkdown(entries: LolChangeEntry[]): string {
  const header = [
    "# Mogsy — League of Legends Section Changelog",
    "",
    `_Generated ${new Date().toISOString()} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}._`,
    "",
    "This document describes the current state of every League-related page on Mogsy (the /lol hub, /lol/tier-list, /combat-lab and /quiz). Paste into ChatGPT for context.",
    "",
    "---",
    "",
  ].join("\n");
  return header + entries.map(entryToMarkdown).join("\n\n---\n\n");
}