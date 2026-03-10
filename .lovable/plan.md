

## Fix: White border during page load

**Root cause**: `src/App.css` applies `padding: 2rem` and `max-width: 1280px` to `#root`. During the brief moment before React hydrates and Tailwind kicks in, the static shell in `index.html` is rendered inside `#root` with that padding, creating a visible white gap (the body's default background showing through).

**Fix** (minimal, single file):

1. **`src/App.css`** — Remove `padding: 2rem` and `max-width: 1280px` from `#root`. These are legacy Vite boilerplate styles that conflict with the app's Layout component (which already handles max-width via `max-w-7xl mx-auto`). The `text-align: center` should also be removed to avoid interference.

   Alternatively, if any of these styles are still needed elsewhere, just zero out the padding. But given the Layout already manages width constraints, the entire `#root` block is dead code.

2. **`index.html`** — Add `style="background:#0a0a1a"` to the `<body>` tag so even before CSS loads, there's no white flash around the shell.

**Files changed**: `src/App.css`, `index.html` (2 lines total)

