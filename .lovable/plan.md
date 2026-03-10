

## Plan: Admin Panel Enhancements

### 1. Admin Users Tab — Anonymous User Management (admin only)

**Changes to `src/components/admin/AdminUsers.tsx`:**
- Add a "Purge Anonymous" button (with confirmation dialog) that bulk-deletes all anonymous profiles and their auth accounts via an edge function
- Add an "Anonymous" sub-feed toggle at the top that auto-filters to anonymous users when clicked, showing them in a dedicated section with count badge
- The existing refresh button stays; add a "Reset Filters" button to clear search/filter/sort back to defaults

**New edge function `supabase/functions/purge-anonymous-users/index.ts`:**
- Accepts admin-only request, fetches all profiles where `is_anonymous = true`
- Deletes their auth accounts via admin API and cascades profile deletion
- Returns count of purged users

### 2. Collections Tab — Per-Item Aura Reset (admin only)

**Changes to `src/components/admin/AdminCollections.tsx`:**
- In the item detail view (when `selectedItem` is set), add a "Reset Aura" button next to the item's Elo badge
- Clicking it resets that single item's `elo` to 1200 in `preset_items`
- Pushes to undo stack so it can be reverted
- Confirmation dialog before reset

### 3. Admin Play — Add/Delete Categories, Subcategories & Items

**Changes to `src/pages/AdminPlay.tsx`:**
- **Add Category**: "+" button in the Categories section header. Creates a new entry in `leagues` table with `type = 'preset'` and the given category name, plus adds it to the layout config
- **Add Subcategory**: "+" button inside an expanded category. Creates a league with that category and subcategory
- **Add Item**: "+" button inside an expanded league/subcategory. Inserts into `preset_items`
- **Delete**: 
  - For admins (`!isModerator`): direct delete with confirmation dialog
  - For moderators (`isModerator`): clicking delete sends an `admin_notification` of type `mod_delete_request` with metadata (item type, ID, name, moderator profile) and shows a toast "Delete request sent to admin"
- Add a Trash2 icon button on each DragItem row (category, league, item level)

### 4. New Admin Tab — Moderator Config

**New file `src/components/admin/AdminModeratorConfig.tsx`:**
- Lists all users with `moderator` role (from `user_roles` table)
- Shows a feed of `admin_notifications` filtered to `type IN ('mod_delete_request', 'mod_action')` 
- Each notification shows: moderator name, what they want to delete, timestamp
- Admin can Approve (execute the delete) or Deny (dismiss notification) with action buttons
- Approve triggers the actual deletion and marks notification as read
- Deny marks as read with a "denied" note

**Changes to `src/pages/Admin.tsx`:**
- Add `{ value: "mod-config", label: "Mod Config", masterOnly: false }` to `allTabs`
- Add `<TabsContent value="mod-config"><AdminModeratorConfig /></TabsContent>`

### Database Changes

**Migration:** No schema changes needed. We'll use the existing `admin_notifications` table with new `type` values (`mod_delete_request`) and metadata containing the delete target info. The `purge-anonymous-users` edge function uses the service role key already available.

### Files to Create/Edit

| File | Action |
|------|--------|
| `src/components/admin/AdminUsers.tsx` | Add purge anon button, anon feed toggle, reset filters |
| `src/components/admin/AdminCollections.tsx` | Add per-item aura reset button |
| `src/pages/AdminPlay.tsx` | Add/delete for categories, subcategories, items with mod permission flow |
| `src/components/admin/AdminModeratorConfig.tsx` | New — moderator management + action notifications |
| `src/pages/Admin.tsx` | Add mod-config tab |
| `supabase/functions/purge-anonymous-users/index.ts` | New — bulk delete anonymous users |

