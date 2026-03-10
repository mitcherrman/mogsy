

## Fix: Moderator image upload RLS + clickable subcategory bars

### 1. RLS policy for moderators uploading images

The `preset_item_images` table only has INSERT/UPDATE/DELETE policies for `admin` role. Moderators aren't admins, so they get blocked. Need to add INSERT and UPDATE policies for moderators.

**Database migration:**
```sql
CREATE POLICY "Moderators can insert images"
ON public.preset_item_images FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));

CREATE POLICY "Moderators can update images"
ON public.preset_item_images FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));
```

### 2. Make subcategory/sub-subcategory bars clickable

Currently, only the `ImageIcon` button triggers `onViewItems`. The label/bar area of league rows inside categories should also navigate to the items view when clicked.

**Changes to `DragItem` component** (lines 810-845 in `AdminPlay.tsx`):
- Make the label `<span>` clickable — when `onViewItems` is provided, clicking the label text triggers `onViewItems()` with a pointer cursor, so the entire bar acts as a clickable entry point (same as the image icon button).

**Files changed:**
- `src/pages/AdminPlay.tsx` — make label clickable when `onViewItems` exists
- Database migration — add moderator INSERT/UPDATE policies on `preset_item_images`

