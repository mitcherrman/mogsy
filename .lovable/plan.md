

## Plan: Wire Published Layout Config into Public Play Tab

The Admin Play Tab saves layout config to the database but Play.tsx doesn't read it yet. This plan connects the two so publishing in APT actually controls what users see.

### Changes to `src/pages/Play.tsx`

1. **Import and fetch published config** — Add `usePlayLayout("published")` hook call at the top of the component.

2. **Apply top-level ordering** — Use the config's `topLevel` array to control which top-level buttons (Collections, Compete, Aura Check) appear and in what order. Hidden items are filtered out.

3. **Apply category ordering** — When building `presetCategories`, if a published config exists, sort categories by their `config.categories[].order` and filter out hidden ones. Use `customLabel` for display if set.

4. **Apply league ordering** — Within each category, sort leagues by their `config.leagues[].order` and filter out hidden ones. Use `customLabel` for display if set.

5. **Fallback** — If no published config exists (`config === null`), keep current behavior unchanged (alphabetical sort, "Other" at end).

### Implementation Detail

The key integration point is after line 172 where `presetCategories` is built. After building the raw map, we'll re-sort its keys and entries using the published config:

```typescript
// After building presetCategories from DB data:
if (publishedConfig) {
  // Filter hidden categories
  // Sort categories by config order
  // Within each category, sort leagues by config order
  // Filter hidden leagues
}
```

Similarly, the top-level bubble rendering (Collections/Compete/Aura Check) will read from `publishedConfig.topLevel` to determine order and visibility.

### Files Modified
- `src/pages/Play.tsx` — Import `usePlayLayout`, apply ordering/visibility/labels from published config

