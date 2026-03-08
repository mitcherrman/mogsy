

## Friend System Implementation Plan

### Database

**New table: `friendships`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| requester_id | uuid | references profiles(id) on delete cascade |
| addressee_id | uuid | references profiles(id) on delete cascade |
| status | text | `pending`, `accepted`, `declined` — default `pending` |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |
| UNIQUE | | (requester_id, addressee_id) |

**RLS policies:**
- SELECT: authenticated users see rows where they are requester or addressee (via security definer helper)
- INSERT: user can insert where requester_id matches their profile
- UPDATE: addressee can update status
- DELETE: either party can delete

**Security definer function** `is_friendship_party` to check if current user owns a profile_id without recursive RLS on profiles.

**Seed data:** Insert ~4 accepted friendships between existing bot profiles so the Home section has content to display.

### Frontend Files

**1. `src/hooks/useFriends.ts`** — Core hook
- `sendRequest(targetProfileId)` — insert pending
- `acceptRequest(friendshipId)` — update to accepted
- `declineRequest(friendshipId)` — delete row
- `removeFriend(friendshipId)` — delete row
- `useFriendStatus(targetProfileId)` — returns `none | pending_sent | pending_received | friends`
- `useFriendsList()` — returns accepted friends with profile data
- `usePendingRequests()` — incoming pending requests

**2. `src/components/FloatingFriendsButton.tsx`** — Floating action button
- Fixed bottom-right (above mobile nav on mobile, above scroll button)
- Users icon with unread pending count badge
- Opens a slide-up sheet/drawer with:
  - **Friends tab**: list of friends (avatar, name, link to profile, unfriend button)
  - **Requests tab**: pending incoming requests with accept/decline
  - **Search**: simple text input to search profiles by display_name and send requests
- Uses the `useFriends` hook

**3. `src/components/HomeFriendsSection.tsx`** — Home page section
- Shows between "Play Now" and "Explore" sections
- Horizontal scroll of friend avatars with names
- "See all" link opens the floating friends panel
- If no friends, shows a prompt to add friends

**4. `src/pages/UserProfile.tsx`** — Add friend button
- Context-aware button: "Add Friend" / "Pending" / "Friends ✓" / "Accept Request"
- Uses `useFriendStatus` hook

**5. `src/components/Layout.tsx`** — Mount FloatingFriendsButton

**6. `src/pages/Home.tsx`** — Add HomeFriendsSection

**7. `src/App.tsx`** — No route changes needed (friends UI is a floating panel)

### Friend Features
- **Send/accept/decline/remove** friend requests
- **Pending request badge** on floating button (real-time feel via refetch)
- **Friend activity** on home (see friends' avatars)
- **Quick profile access** from friends list
- **Search users** to send requests from the friends panel

### Files changed
| File | Action |
|------|--------|
| Migration SQL | Create `friendships` table, RLS, helper fn, seed bot friendships |
| `src/hooks/useFriends.ts` | Create |
| `src/components/FloatingFriendsButton.tsx` | Create |
| `src/components/HomeFriendsSection.tsx` | Create |
| `src/pages/UserProfile.tsx` | Edit — add friend button |
| `src/pages/Home.tsx` | Edit — add friends section |
| `src/components/Layout.tsx` | Edit — mount floating button |

