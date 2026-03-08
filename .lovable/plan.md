

## Plan: Fade Only Background During Cycle Transitions

The current black overlay covers the entire screen (navbar, content, everything). Instead, we should only fade the theme background and overlay, leaving content, navbar, and floating buttons fully visible.

### Changes

**`src/components/Layout.tsx`**

1. Move the fade-to-black overlay to sit behind the content but covering only the theme background layer
2. Wrap the background (`pageBg` style) and `ThemeOverlay` together in a container at `z-0`
3. Place the black fade overlay inside that same container (or just above it at `z-[5]`), so it only obscures the decorative background — not the navbar (`z-50`), content (`z-20`), or floating buttons (`z-60`)

Specifically:
- Change the black overlay from `z-[55]` to `z-[15]` (above ThemeOverlay at `z-10`, below content at `z-20`)
- This means the background + theme particles fade to black while content stays fully visible

### Result
During cycle transitions, the decorative background (gradients, particles, overlays) fades to black and back, while the navbar, page content, and floating buttons remain fully visible and unaffected.

