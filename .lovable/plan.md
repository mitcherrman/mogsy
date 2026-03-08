

## Plan: Admin Play Tab (APT) — Comprehensive Layout Manager + Animation Scheduling

This is a large feature with three parts: (1) a new database table for layout config and league animation rules, (2) a new `/admin/play` page that mirrors the Play tab with drag-and-drop editing, and (3) integration into the public Play page and swipe system.

---

### Database Changes

**New table: `play_layout_config`**
```sql
CREATE TABLE play_layout_config (
  id text PRIMARY KEY, -- 'draft' or 'published'
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE play_layout_config ENABLE ROW LEVEL SECURITY;

-- Public can read published config
CREATE POLICY "Published config is publicly readable" ON play_layout_config
  FOR SELECT USING (id = 'published');
-- Admins can read all
CREATE POLICY "Admins can read all configs" ON play_layout_config
  FOR SELECT USING (has_role(auth.uid(), 'admin'));
-- Master admins can insert/update
CREATE POLICY "Master admins can upsert configs" ON play_layout_config
  FOR ALL USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));
```

**New table: `league_animation_rules`**
Stores per-league animation scheduling (e.g., "play mogged every 3 swipes").
```sql
CREATE TABLE league_animation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  animation_id text NOT NULL,
  every_n_swipes integer NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_id, animation_id)
);
ALTER TABLE league_animation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rules are publicly readable" ON league_animation_rules
  FOR SELECT USING (true);
CREATE POLICY "Master admins can manage rules" ON league_animation_rules
  FOR ALL USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));
```

### Config JSONB Structure

```json
{
  "topLevel": [
    { "key": "collections", "label": "Collections", "icon": "grid", "hidden": false, "order": 0 },
    { "key": "compete", "label": "Compete", "icon": "users", "hidden": false, "order": 1 },
    { "key": "elocheck", "label": "Aura Check", "icon": "zap", "hidden": false, "order": 2 }
  ],
  "categories": [
    { "key": "Anime", "parentKey": "collections", "hidden": false, "order": 0, "customLabel": null, "customIcon": null },
    { "key": "Movies", "parentKey": "collections", "hidden": false, "order": 1, "customLabel": null, "customIcon": null }
  ],
  "leagues": [
    { "id": "uuid", "hidden": false, "order": 0, "customLabel": null }
  ]
}
```

---

### New Files

**1. `src/pages/AdminPlay.tsx`** — The main APT page
- Master admin gate (check `is_master_admin` via `user_roles`)
- Full-screen layout that mirrors the Play tab visually
- Three editing panels via collapsible sections:
  - **Top-Level Bubbles**: Reorder, hide, edit labels for Collections/Compete/Aura Check
  - **Categories**: Reorder, hide, rename categories within each top-level section
  - **Leagues**: Reorder, hide, rename individual leagues within each category
- Each item is rendered as a draggable card using HTML5 drag-and-drop (no new library — use `onDragStart`, `onDragOver`, `onDrop` with framer-motion for visual feedback)
- Click any bubble/item to open an edit drawer with:
  - Label override
  - Visibility toggle
  - **Animation Rules** section (for leagues only): Add/remove animation rules with `animation_id` + `every_n_swipes` dropdowns
- Live preview panel showing exactly how the Play page will look
- **"Confirm & Publish"** button: copies draft config to published row
- **"Reset to Default"** button: deletes config (Play page falls back to DB order)

**2. `src/components/admin/AdminPlayItemEditor.tsx`** — Edit drawer/dialog for a single item
- Fields: custom label, visibility toggle
- For leagues: animation rule editor with:
  - List of current rules showing `{animation_name} every {N} swipes`
  - Add rule: dropdown of all animations + number input for frequency
  - Delete rule button
  - E.g., "🗿 Mogged — every 3 swipes", "🔪 You're Chopped — every 4 swipes"

**3. `src/hooks/usePlayLayout.ts`** — Shared hook for reading published config
- Fetches `play_layout_config` where `id = 'published'`
- Merges with actual leagues from DB (auto-includes new leagues at end)
- Returns sorted/filtered arrays for top-level, categories, leagues

**4. `src/hooks/useLeagueAnimationRules.ts`** — Hook for reading animation rules per league
- Fetches `league_animation_rules` for a given league_id
- Returns rules array; swipe page uses this to override default animation on every Nth swipe

---

### Modified Files

**5. `src/pages/Play.tsx`**
- Import `usePlayLayout` hook
- If published config exists, use it to sort/filter top-level items, categories, and leagues
- Otherwise, fall back to current behavior (zero breaking change)

**6. `src/pages/Admin.tsx`**
- Add "Play Layout" button in the header area, visible only to master admins
- Routes to `/admin/play`

**7. `src/App.tsx`**
- Add lazy-loaded route: `/admin/play` → `AdminPlay`

**8. `src/pages/Swipe.tsx` and `src/pages/SwipePreset.tsx`**
- Import `useLeagueAnimationRules` for the current league
- Track swipe count in local state
- On each swipe, check if any rule matches (swipeCount % rule.every_n_swipes === 0)
- If matched, override the user's selected animation with the rule's animation for that swipe
- Multiple rules are checked in sort_order; first match wins

---

### Key Design Decisions

1. **Drag-and-drop without a library**: Use HTML5 drag events + framer-motion `layoutId` for smooth reorder animations. This avoids adding `@dnd-kit` or `react-beautiful-dnd` as dependencies.

2. **Animation scheduling is per-league, not per-theme**: Each league can have independent animation rules. The admin sets "in NBA Players league, play Mogged every 3 swipes and You're Chopped every 4 swipes." On swipe #12 (divisible by both 3 and 4), the lower sort_order rule wins.

3. **Draft/publish workflow**: Admin always edits a draft. Nothing goes live until "Confirm." This prevents accidental layout changes from affecting users.

4. **Auto-merge new content**: If a new league or category is added via the Collections admin tab, it automatically appears at the bottom of the APT with default settings. The admin doesn't have to manually add it.

5. **The APT mirrors the Play tab exactly**: Same Bubble component, same layout modes (bubbles/pills/grid/list/tiles), same hierarchy. But each element has a drag handle, edit icon, and visibility toggle overlaid on it.

