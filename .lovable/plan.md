

# Fix Layout padding to match Navbar height

## Problem
The Navbar has a height of `h-14` (56px), but the Layout's main content uses `pt-16` (64px) as its top padding. This 8px mismatch means the page content doesn't sit flush below the fixed navbar -- there's a small gap between the navbar bottom edge and where content begins.

## Change
**File: `src/components/Layout.tsx`** (line 11)
- Change `pt-16` to `pt-14` so the main content padding exactly matches the navbar's `h-14` height.

This is a one-line change with zero risk to functionality or design.

