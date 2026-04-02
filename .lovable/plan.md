

# Add ads.txt for AdSense Verification

## Problem
Google AdSense requires an `ads.txt` file at the site root to authorize ad serving. Without it, ads may not fill or revenue may be held.

## Change

### Create `public/ads.txt`
Single line:
```
google.com, pub-9823769047605421, DIRECT, f08c47fec0942fa0
```

Vite automatically serves files from `public/` at the root, so this will be accessible at `https://mogsy.lovable.app/ads.txt` (and `https://mogsy.com/ads.txt` once on the custom domain).

No other changes needed.

