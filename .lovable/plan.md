## Cause

The initial shell in `index.html` paints before any image bytes are on disk:

```html
<img src="/mogsy-logo-text.png" alt="Mogsy" width="264" height="176" ... />
```

Until the PNG decodes, the browser renders the `alt="Mogsy"` text inside a 264×176 box. That is the "flashes of the word Mogsy" you see right after a hard refresh — same root cause on the homescreen as on `/swipe`. Once the logo decodes (or React mounts and `RouteLoader` swaps in), it disappears.

The runtime `RouteLoader` in `src/components/Layout.tsx` has the same issue (`alt=""` is fine there, but it uses `animate-pulse` which can briefly show an empty box too).

## Fix

1. In `index.html`, make the shell image decorative and hide it until it has actually loaded so no alt text is ever painted:
   - `alt=""` + `aria-hidden="true"`
   - inline `opacity:0` with an `onload="this.style.opacity=1"` handler (kept inline so it works before any JS module loads)
   - keep the existing `width`/`height`/`fetchpriority`/`decoding` attributes so layout is reserved and LCP is unchanged
2. Keep the page background `#0a0a1a` so the hidden state looks like a clean dark screen rather than a flashing text block.
3. No change to `src/main.tsx` shell-removal logic — the fade-out still works.

## Files

- `index.html` — update the `#initial-shell` `<img>` only.

No other files, no routing, no backend changes.
