

## Fix: Blurry Profile Images

### Root Cause
The bot avatars use `randomuser.me/api/portraits/` URLs which serve **128×128px** images. The new card layout stretches these across a much larger area (`aspect-[3/4]`, roughly 200–400px wide), causing visible blur.

### Solution
Update the 10 bot avatar URLs in the database to use higher-resolution stock photo sources. Options:

- **`thispersondoesnotexist.com`** — AI-generated faces, 1024×1024
- **`xsgames.co/randomusers`** — higher-res stock photos
- **`pravatar.cc`** — supports size parameter (`pravatar.cc/500?img=X`)

**Recommended: `pravatar.cc/500?img=X`** — simple, reliable, 500×500px, good enough for mobile cards.

### Changes

**Database migration** — Update `avatar_url` for all 10 bot profiles:
```sql
UPDATE profiles SET avatar_url = 'https://i.pravatar.cc/500?img=N' WHERE id = '...';
```

Each bot gets a unique `?img=` number (1–70 range) for distinct faces.

**No code changes needed** — the card component already uses `object-cover` which will handle the larger images well.

