

## Feasibility Analysis: Fully Modular Category Hierarchy in Admin Play

### Current Architecture

The system uses a **fixed two-level hierarchy**:
- **Categories** (e.g., Anime, Movies, Food) -- always at the top level under "Collections"
- **Leagues/Subcategories** (e.g., "Best Anime", "Best Movie of All Time") -- always nested inside a category

Categories have a `parentKey` field (always set to `"collections"`), and leagues are mapped to categories via the `leagues` table's `category` column. The admin UI renders categories as a flat reorderable list, each expanding to show its child leagues.

### What You Want

A **tree structure** where any node can be reparented to any level:
- Move "Best Anime" (currently a subcategory/league under Anime) up to sit alongside Anime, Movies, Food
- Move "Superheroes" (currently a top-level category) down to be nested inside Movies

### Feasibility: High -- but requires a data model shift

The `parentKey` field on `LayoutCategory` already exists and could support arbitrary nesting. The main work is:

1. **Add a "Move to..." action** on each category and league item in the admin drag list. This would open a dropdown/dialog showing all possible parent locations (root level, or inside any other category). Selecting one updates the item's `parentKey` (for categories) or `category` column (for leagues promoted to categories).

2. **Support categories-as-children-of-categories** in the layout config. Currently `LayoutCategory.parentKey` is always `"collections"`. Allowing it to reference another category key creates a recursive tree. The admin UI would render this as nested expandable sections (already supported via `expandedCategories`).

3. **Promote leagues to categories and demote categories to leagues.** When moving a league up to be a peer of categories, it effectively becomes a category (a node with no children, or with its own children). When moving a category down inside another, it becomes a child node.

### Proposed Plan

**A. Extend the data model (in `usePlayLayout.ts`)**
- `LayoutCategory.parentKey` can be `"collections"` (root) or any other category key (nested)
- Add a `children` concept implicitly via `parentKey` references -- no schema change needed, just rendering logic

**B. Add "Move to" UI on each DragItem (`AdminPlay.tsx`)**
- Add a folder/move icon button on each category and league row
- On click, show a dropdown listing all valid parent targets: "Root (Collections)", plus all existing categories
- On selection, update the item's `parentKey` (or convert league to category / category to subcategory)
- When moving a league up to root, create a new `LayoutCategory` entry for it
- When moving a category into another, update its `parentKey`

**C. Update rendering logic in AdminPlay**
- Change the Categories section to render recursively: root categories first, then nested categories inside expanded parents
- `getLeaguesForCategory` already handles filtering -- just needs to also include child categories

**D. Update Play.tsx consumption**
- The Play page navigation needs to handle the recursive tree when building the bubble/pill UI for browsing

### Scope Estimate
- ~150-250 lines of new/changed code across `AdminPlay.tsx`, `usePlayLayout.ts`, and `Play.tsx`
- No database migration needed (layout config is stored as JSON in `play_layout_config`)
- Medium complexity -- the recursive rendering and move logic are the trickiest parts

### Summary

This is very feasible. The `parentKey` field already exists to support it. The main work is adding a "Move to" dropdown on each row in the admin list, updating `parentKey` on selection, and making both the admin and Play page render the tree recursively.

