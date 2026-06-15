import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Info, Search, ChevronUp } from "lucide-react";

/**
 * Admin-only encyclopedic reference for the Mogsy app.
 * Single long-scroll page with sticky TOC + client-side search filter.
 * No backend calls — purely hand-maintained documentation.
 */

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
  /** Searchable plain-text payload (kept separate from JSX for filtering). */
  keywords: string;
};

const Tag = ({ children }: { children: React.ReactNode }) => (
  <code className="px-1.5 py-0.5 rounded bg-secondary text-foreground text-[11px] font-mono">{children}</code>
);

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-base font-bold text-foreground mt-5 mb-2">{children}</h3>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm leading-relaxed text-muted-foreground mb-3">{children}</p>
);

const UL = ({ children }: { children: React.ReactNode }) => (
  <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground mb-3 marker:text-primary/60">{children}</ul>
);

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5 border-b border-border/40 last:border-0">
    <div className="text-xs font-bold text-foreground">{k}</div>
    <div className="text-xs text-muted-foreground">{v}</div>
  </div>
);

const sections: Section[] = [
  {
    id: "overview",
    title: "1. Overview & Core Concept",
    keywords: "overview core concept mogsy head to head voting swipe ranking aura elo",
    body: (
      <>
        <P>
          Mogsy is a social ranking platform built around a single repeating loop: a user is shown two cards
          (profiles, items, characters) and chooses which one is "better." Each vote updates Elo for both items
          (locally for the league and globally for the site), which feeds leaderboards, profile tiers, and the
          competitive multiplayer modes.
        </P>
        <P>
          Everything else in the app — collections, custom leagues, multiplayer games, the shop, profiles,
          comments, blog — exists to feed, expose, or monetize that core voting loop.
        </P>
      </>
    ),
  },
  {
    id: "terminology",
    title: "2. Terminology",
    keywords: "terminology aura leaderboard collections compete preset user leagues elo nomenclature",
    body: (
      <div className="rounded-lg border border-border bg-card/40 p-4 space-y-1">
        <Row k="Aura" v="User-facing brand name for Elo. A single number that goes up/down per matchup." />
        <Row k="Leaderboard" v="User-facing brand name for Rankings. Sorted list of items/profiles by Aura." />
        <Row k="Collections" v="User-facing name for admin-curated Preset Leagues (top-level Play bubbles)." />
        <Row k="Compete" v="User-facing name for User Leagues — community-created leagues with eligibility gates." />
        <Row k="Preset League" v={<>System-defined league. Items managed by admins via <Tag>AdminPresetItems</Tag>.</>} />
        <Row k="User League" v="Community-created league surfaced in SwipeHub and the Leagues directory." />
        <Row k="Elo" v="Internal code term for the rating. K-factor 32, expected score formula in src/lib/elo.ts." />
        <Row k="Local vs Global Aura" v="Local = per-league rating, updated instantly. Global = sitewide, snapshotted hourly." />
      </div>
    ),
  },
  {
    id: "user-pages",
    title: "3. User-Facing Pages (every route)",
    keywords: "routes pages home auth play profile swipe hub preset leagues leaderboard shop elo check referral settings multiplayer feedback blog combat lab lol secret reset password",
    body: (
      <>
        <P>Every public/authenticated route in the app:</P>
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-1">
          <Row k="/" v="Index landing/splash. Initializes anonymous session; returning users go to /home." />
          <Row k="/home" v="Main dashboard. Navigation hub, friends strip, blog highlight strip, recent matchups." />
          <Row k="/auth" v="Sign-up, login, Google OAuth, anonymous → real account linking, confirm-password." />
          <Row k="/play" v="Discovery hub. Collections, Compete, EloCheck, Multiplayer. Five desktop layouts (Bubbles/Pills/Grid/List/Tiles) persisted to localStorage. Play↔Swipe hub-mode toggle." />
          <Row k="/profile" v="Own profile. Avatar, Aura, tier badge, favorites, top comments, photo circles, Pro cosmetics." />
          <Row k="/swipe" v="SwipeHub — browse user leagues to join." />
          <Row k="/swipe-game" v="Core swipe session (user leagues). Gesture engine, preload, comments, ads, animations." />
          <Row k="/swipe/preset/:leagueId" v="Swipe session scoped to a Preset (Collection) league." />
          <Row k="/leagues/:type" v="Directory of leagues filtered by type (preset / user / etc.)." />
          <Row k="/leaderboard/:leagueId" v="Global, league, and personal leaderboards. Tier badges, Compete eligibility filter." />
          <Row k="/shop" v="Pro subscription, Diamond packs, power-ups, gifting, gift redemption, cinematic Pro ad." />
          <Row k="/elo-check" v="Public Aura lookup tool for any profile." />
          <Row k="/swipe-leagues" v="Focused subset of leagues available for swiping." />
          <Row k="/user/:profileId" v="Public profile. Friend actions, report, favorites, top comments, photo circles." />
          <Row k="/referral" v="Invite-a-friend page with referral link, copy button, conversion stats." />
          <Row k="/settings" v="Account: sign out, password, theme info, notifications, account deletion." />
          <Row k="/multiplayer" v="Lobby for 2v2 modes. Mode bubbles, league picker, list of open joinable games." />
          <Row k="/multiplayer/game/:gameId" v="Active multiplayer match — routes to the per-mode component + GameResults." />
          <Row k="/feedback" v="User feedback submission form — appears in AdminFeedback." />
          <Row k="/blog" v="Public blog listing. Search, tag filter, status filter." />
          <Row k="/blog/:slug" v="Blog post reader. Themed wrappers, block/rich content, live data blocks, share buttons." />
          <Row k="/combat-lab" v="Interactive sandbox to build & export custom matchup cards (screenshot + GIF export)." />
          <Row k="/lol" v="Dedicated League of Legends content hub." />
          <Row k="/:slug" v="Universal slug resolver. Checks swipe_tab_config buttons, then custom_links via RPC." />
          <Row k="/secret-room" v="Easter egg / hidden page." />
          <Row k="/reset-password" v="Supabase RECOVERY flow — new password + confirmation." />
          <Row k="/moderator" v="Scoped panel for the moderator role (see §15)." />
        </div>
      </>
    ),
  },
  {
    id: "multiplayer",
    title: "4. Multiplayer Game Modes",
    keywords: "multiplayer 2v2 tag team draft duel prediction wars siege hot streak gauntlet realtime",
    body: (
      <>
        <P>All modes are 2v2, built on preset or user leagues. State managed by <Tag>useMultiplayerGame</Tag> + Supabase realtime channels.</P>
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-1">
          <Row k="Tag Team" v="Each duo submits items; community votes decide the winner." />
          <Row k="Draft & Duel" v="Snake draft — players alternately pick items, then a best-of series battle." />
          <Row k="Prediction Wars" v="Players predict matchup outcomes; most correct predictions wins." />
          <Row k="Siege Mode" v="Each team defends a tower; successful votes damage the opponent." />
          <Row k="Hot Streak" v="Tag-team relay; team with the longest combined swipe streak wins." />
          <Row k="Gauntlet" v="Winner-stays format with state guards to prevent flicker. Lock icon in MultiplayerModeCard means gated/coming soon depending on config." />
        </div>
        <P>Lobby (<Tag>MultiplayerLobby</Tag>) handles waiting state, mode descriptions, and open-game discovery.</P>
      </>
    ),
  },
  {
    id: "swipe-mechanics",
    title: "5. Swipe Mechanics",
    keywords: "swipe gesture preload ready overlay direction timer card stats comments ad injection animations tutorial inventory",
    body: (
      <>
        <H>Gesture engine</H>
        <P>Touch + mouse drag with velocity/offset thresholds. Keyboard arrow keys also vote. See <Tag>useSwipeGesture</Tag>.</P>

        <H>Preloading</H>
        <P>On each pair load the next 3 matchup pairs (≈6 avatars) are preloaded off-screen to eliminate flash on the next card.</P>

        <H>Overlays</H>
        <UL>
          <li><Tag>SwipeReadyOverlay</Tag> — 1.5s "ready" gate at session start.</li>
          <li><Tag>SwipeDirectionOverlay</Tag> — animated left/right arrows while dragging.</li>
          <li><Tag>SwipeTimer</Tag> — optional per-swipe countdown via <Tag>useSwipeTimer</Tag>; pauses for ads/overlays.</li>
        </UL>

        <H>Card stats footer</H>
        <P><Tag>CardStatsFooter</Tag> renders configurable per-league stats (win rate, votes, Aura). Configured by <Tag>AdminCardStatsPreview</Tag> + <Tag>useAppSettings</Tag>. Pixel-matched during transitions.</P>

        <H>Comments</H>
        <P><Tag>SwipeComments</Tag> opens in a bottom drawer — create, like, report per matchup pair. Commenter identity resolved via the <Tag>public_profiles</Tag> view.</P>

        <H>Ad injection</H>
        <P>Every N swipes (default 10) <Tag>useAdSystem("swipe")</Tag> fires. Types: <Tag>popup</Tag> (full-screen <Tag>SwipeAd</Tag>), <Tag>in_swipe</Tag> (<Tag>SwipeAdCard</Tag>), or AdSense inline. Pro users see none; admins/mods always see for QA.</P>

        <H>Animations</H>
        <P>On vote, <Tag>CardAnimationRouter</Tag> dispatches the chosen exit animation. Each animation has a paired sound effect. <Tag>SwipeAnimationPicker</Tag> lets users choose; admins gate availability via <Tag>AdminCardAnimations</Tag>.</P>
        <UL>
          <li>Default Fade, Mogged, Burn, Crush, Shatter, Chop, Vaporize, Among Us, Sgt. Doakes, Slice Battle</li>
        </UL>

        <H>Tutorial tips & inventory</H>
        <UL>
          <li><Tag>TutorialTipPopup</Tag> — contextual coach-mark tips, configured in <Tag>AdminTutorialTips</Tag>.</li>
          <li><Tag>SwipeInventoryButton</Tag> — surfaces active power-ups during a session.</li>
        </UL>
      </>
    ),
  },
  {
    id: "aura-elo",
    title: "6. Aura / Elo System",
    keywords: "aura elo k factor formula local global snapshot tier badge ranks elo check",
    body: (
      <>
        <H>Algorithm (src/lib/elo.ts)</H>
        <pre className="text-xs bg-secondary/60 rounded-lg p-3 overflow-x-auto text-foreground">
{`K = 32
expected = 1 / (1 + 10^((loserElo - winnerElo) / 400))
newWinner = round(winnerElo + 32 * (1 - expected))
newLoser  = round(loserElo  + 32 * (0 - (1 - expected)))`}
        </pre>

        <H>Dual Elo</H>
        <P>Every vote writes <Tag>local_rankings</Tag> (per-league, instant) and contributes to global Aura (snapshotted hourly via the <Tag>snapshot-global-elo</Tag> edge function). Profiles bot-safe — <Tag>profiles.user_id</Tag> has no FK to <Tag>auth.users</Tag>.</P>

        <H>Tier system</H>
        <P>Percentile-based tiers configured in <Tag>AdminRankSettings</Tag>: Iron → Bronze → Silver → Gold → Diamond (master-admin editable). Rendered as <Tag>TierBadge</Tag>. Feature globally toggleable.</P>

        <H>Tooling</H>
        <P><Tag>EloChangeIndicator</Tag> shows the +/− delta after each vote. <Tag>/elo-check</Tag> and admin <Tag>AdminEloCheck</Tag> let anyone (or only admins, respectively) inspect/adjust Elo.</P>
      </>
    ),
  },
  {
    id: "leaderboards",
    title: "7. Leaderboards",
    keywords: "leaderboard global league personal compete eligibility tier badges blog block ranking",
    body: (
      <UL>
        <li><strong>Global</strong> — every profile ranked by global Aura.</li>
        <li><strong>League</strong> — per-league ranking by local Elo, accessible from any league card.</li>
        <li><strong>Personal ("Your Leaderboard")</strong> — your leagues sourced from <Tag>local_rankings</Tag>.</li>
        <li><strong>Compete eligibility</strong> — admin thresholds (min swipes + min Elo) gate appearance to keep rankings clean.</li>
        <li><strong>Tier badges</strong> — inline percentile badges when the feature is enabled.</li>
        <li><strong>Blog data block</strong> — <Tag>LeaderboardBlock</Tag> embeds live tables inside any blog post.</li>
        <li><strong>Default Elo</strong> — newly-seeded items start at 1200; hidden/flagged items excluded from population.</li>
      </UL>
    ),
  },
  {
    id: "shop",
    title: "8. Shop & Monetization",
    keywords: "shop monetization pro subscription 9.99 diamond currency power up boost elo shield reveal rewind gift cinematic stripe",
    body: (
      <>
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-1 mb-3">
          <Row k="Mogsy Pro" v="$9.99/mo or annual. Ad-free, exclusive themes + cosmetics, Pro badge, premium animations." />
          <Row k="Diamond packs" v="One-time Stripe IAP. Various 💎 amounts." />
          <Row k="Exposure Boost" v="50 💎 — 2× visibility in swipe queues for 24h." />
          <Row k="ELO Shield" v="30 💎 — protects from next 3 Elo losses." />
          <Row k="Reveal" v="25 💎 — see who voted for you." />
          <Row k="Rewind" v="15 💎 — undo last vote." />
        </div>
        <H>Gifting</H>
        <P>Pro subs and Diamond packs can be gifted. Redemption via <Tag>redeem-gift</Tag> + <Tag>verify-gift</Tag> edge functions.</P>
        <H>Cinematic Pro Ad</H>
        <P><Tag>ProCinematicAd</Tag> — full-screen branded marketing experience shown to non-Pro users in Shop.</P>
        <H>Sound</H>
        <P><Tag>useShopSound</Tag> plays distinct Web Audio tones for purchases, diamond taps, and power-up activations.</P>
      </>
    ),
  },
  {
    id: "profiles",
    title: "9. Profiles",
    keywords: "profile own public favorites auto manual photo circles top comments premium cosmetics pro themes public profiles view friend actions",
    body: (
      <UL>
        <li><strong>Own (<Tag>/profile</Tag>) vs Public (<Tag>/user/:id</Tag>)</strong> — same shape, different edit permissions.</li>
        <li><strong>Avatar</strong> — uploaded photo, circular crop, Pro-unlockable rings.</li>
        <li><strong>Aura + tier</strong> — prominent, clickable to EloCheck breakdown.</li>
        <li><strong>Favorites</strong> — <Tag>ProfileFavoriteCards</Tag>, auto (top voted) or manual via <Tag>FavoritesEditor</Tag>.</li>
        <li><strong>Photo circles</strong> — <Tag>ProfilePhotoCircles</Tag> row of trophies / achievements / custom uploads.</li>
        <li><strong>Top comments</strong> — <Tag>ProfileTopComments</Tag> — highest-liked surfaced.</li>
        <li><strong>Pro cosmetics</strong> — themes, animated borders, background overlays, accent colors via <Tag>src/lib/profile-themes.ts</Tag>.</li>
        <li><strong>public_profiles view</strong> — safe DB view exposing only non-sensitive fields for public lookups (respects RLS).</li>
        <li><strong>Friend actions</strong> — send/cancel request, block, report via <Tag>FriendActionMenu</Tag>.</li>
      </UL>
    ),
  },
  {
    id: "social",
    title: "10. Social",
    keywords: "social friends notifications comments reports moderation floating friends",
    body: (
      <UL>
        <li><strong>Friends</strong> — request/accept/decline/cancel. <Tag>FloatingFriendsButton</Tag> on every page. <Tag>HomeFriendsSection</Tag> on Home.</li>
        <li><strong>Notifications</strong> — <Tag>UserNotificationBell</Tag> in navbar. Types: friend request/accepted, comment reply, league invite. Admins broadcast via <Tag>AdminNotifications</Tag> / <Tag>AdminPushNotifications</Tag>.</li>
        <li><strong>Comments</strong> — per-matchup threads with likes; moderated in <Tag>AdminComments</Tag>; security definer hides flagged content.</li>
        <li><strong>Reports</strong> — any user can report profiles/comments. Queue in <Tag>AdminUserReports</Tag>.</li>
        <li><strong>Moderation hygiene</strong> — automated report thresholds auto-hide comments and images.</li>
      </UL>
    ),
  },
  {
    id: "onboarding",
    title: "11. Onboarding Flow",
    keywords: "onboarding welcome profile categories theme preferred categories retry",
    body: (
      <>
        <P>Triggers for new accounts via <Tag>OnboardingFlow</Tag>; four sequential steps:</P>
        <UL>
          <li><strong>Welcome</strong> — brand intro + CTA.</li>
          <li><strong>Profile</strong> — display name + avatar upload (with retry logic for initial profile creation).</li>
          <li><strong>Categories</strong> — pick 1–5 interest categories → saved to <Tag>preferred_categories</Tag> on profile.</li>
          <li><strong>Theme</strong> — pick free starting theme → persisted to <Tag>custom_theme</Tag> + localStorage.</li>
        </UL>
        <P>On completion <Tag>onboarding_completed</Tag> is set <Tag>true</Tag>, suppressing future runs.</P>
      </>
    ),
  },
  {
    id: "themes",
    title: "12. Themes",
    keywords: "themes light dark pro sitewide profile floating switcher fts overlay",
    body: (
      <UL>
        <li><strong>Light / Dark / Pro</strong> — Pro themes unlocked by subscription.</li>
        <li><strong>Sitewide theme</strong> — global CSS variables via <Tag>useSitewideTheme</Tag>; configurable by master_admin in <Tag>AdminThemes</Tag>.</li>
        <li><strong>Profile theming</strong> — per-profile display theme affecting public profile background/cards (<Tag>src/lib/profile-themes.ts</Tag>).</li>
        <li><strong>Floating switcher (FTS)</strong> — persistent FAB on every page; anchors above bottom nav on mobile; cross-tab sync via custom events.</li>
        <li><strong>ThemeOverlay</strong> — animated background effects (particles, gradients) for Pro themes.</li>
      </UL>
    ),
  },
  {
    id: "navigation",
    title: "13. Navigation",
    keywords: "navigation navbar nav banner bottom bubble hub play layouts hub mode toggle auto hide",
    body: (
      <UL>
        <li><strong>Navbar</strong> — top bar with logo, links, notification bell, avatar. Auto-hides on scroll down.</li>
        <li><strong>NavBanner</strong> — optional rotating announcement strip; managed by <Tag>AdminBanners</Tag>.</li>
        <li><strong>Bottom nav</strong> — mobile sticky bar (Home, Play, Swipe, Leaderboard, Profile). Disabled on game routes.</li>
        <li><strong>Bubble Hub</strong> — Play page primary nav. Top-level categories as circles; expand sub-items inline.</li>
        <li><strong>Play hub desktop layouts</strong> — Bubbles, Pills, Grid, List, Tiles (persisted to localStorage).</li>
        <li><strong>Hub mode toggle</strong> — switches Play between "Play" (browse) and "Swipe" (jump-to-session) modes.</li>
        <li><strong>Auto-hide navbar</strong> — scroll-direction detection for maximum mobile real estate.</li>
      </UL>
    ),
  },
  {
    id: "admin-inventory",
    title: "14. Admin Pages — Complete Inventory",
    keywords: "admin tabs users collections bots promoted comments invites push banners reports tutorials feedback mod config directory themes ranks onboarding settings play data demo gaming blog",
    body: (
      <>
        <P>Admin pages are protected by <Tag>AdminRoute</Tag>. Roles: <Tag>admin</Tag>, <Tag>master_admin</Tag>, <Tag>moderator</Tag>. Master-only tabs marked with *.</P>

        <H>/admin (Admin.tsx) — paginated tab interface</H>
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-1">
          <Row k="Users" v="Search, view, ban, promote; grant diamonds; manage roles." />
          <Row k="Collections" v="Create/edit/reorder content collections + categories." />
          <Row k="Bots" v="Configure automated bot accounts that seed swipe queues." />
          <Row k="Promoted" v="Pin leagues to the top of discovery feeds." />
          <Row k="Comments" v="Review, delete, moderate user comments." />
          <Row k="Invite Links" v="Generate invite codes with usage caps." />
          <Row k="Push" v="Send push notifications to all/segments." />
          <Row k="Banners" v="Create rotating NavBanner announcements." />
          <Row k="Reports" v="Review user reports; ban/dismiss." />
          <Row k="Tutorials" v="Edit contextual tip text + trigger conditions." />
          <Row k="Feedback" v="Read user-submitted feedback." />
          <Row k="Mod Config" v="Define moderator permissions + visibility scope." />
          <Row k="Directory" v="Browse all public profiles; bulk operations." />
          <Row k="Themes *" v="Edit global sitewide theme + Pro theme definitions." />
          <Row k="Ranks *" v="Configure percentile tier thresholds (Iron → Diamond)." />
          <Row k="Onboarding *" v="Edit onboarding step content + category options." />
          <Row k="Settings *" v="Global feature flags + config values." />
        </div>

        <H>/admin/play (AdminPlay.tsx) — Play hub content tree</H>
        <UL>
          <li><Tag>AdminPlayItemEditor</Tag> — create/edit individual play items (name, image, link, visibility).</li>
          <li><Tag>AdminPlayLeagueItems</Tag> — manage which leagues appear under each play section.</li>
          <li><Tag>AdminCardStatsPreview</Tag> — live preview + configure the card stats footer layout.</li>
          <li><Tag>AdminMultiplayer</Tag> — toggle modes on/off, configure per-mode rules.</li>
        </UL>

        <H>/admin/data (AdminData.tsx)</H>
        <UL>
          <li><Tag>AdminStats</Tag> — platform metrics (swipes/day, new users, active leagues).</li>
          <li><Tag>AdminAdAnalytics</Tag> — ad impressions/clicks/conversions per placement.</li>
          <li><Tag>AdminPresetItems</Tag> — manage items inside admin-curated preset leagues.</li>
        </UL>

        <H>/admin/demo (AdminDemo.tsx)</H>
        <P>Internal sandbox to test animations, stats previews, UI components without affecting prod data. Uses <Tag>CardPreviewEditor</Tag> + <Tag>CardAnimationRouter</Tag>.</P>

        <H>/admin/gaming (AdminGaming.tsx)</H>
        <UL>
          <li><Tag>AdminSwipeGameConfig</Tag> — swipe session rules (timer, duration, pair algorithm).</li>
          <li><Tag>AdminSwipeTabConfig</Tag> — Swipe hub layout, button order, slug mappings.</li>
          <li><Tag>AdminFirstGameTriggers</Tag> — rewards/events on a user's first swipe game.</li>
          <li><Tag>AdminEloCheck</Tag> — look up + manually adjust any user's Elo.</li>
          <li><Tag>AdminMultiplayer</Tag> — enable/disable modes; capacity limits.</li>
          <li><Tag>AdminLeagueSettings</Tag> — league card display metadata + ordering.</li>
          <li><Tag>AdminAds</Tag> — full ad system control (see §16).</li>
          <li><Tag>AdminCardAnimations</Tag> — enable/disable swipe animations + per-animation weights.</li>
          <li><Tag>AdminSounds</Tag> — upload + manage 13 configurable sound effects.</li>
        </UL>

        <H>/admin/blog + /admin/blog/:id</H>
        <P>Post list with create/duplicate/publish/draft/delete. Editor (<Tag>AdminBlogEditor</Tag>) supports Blocks mode (<Tag>BlocksEditor</Tag>) and Rich mode (TipTap). See §20.</P>
      </>
    ),
  },
  {
    id: "moderator",
    title: "15. Moderator Panel & Role Matrix",
    keywords: "moderator role panel admin master admin permissions matrix",
    body: (
      <>
        <P><Tag>/moderator</Tag> — scoped panel for the <Tag>moderator</Tag> role. Subset of admin capabilities, no system settings/billing/role management.</P>
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-1">
          <Row k="Comment moderation" v="Mod ✅ · Admin ✅ · Master ✅" />
          <Row k="User reports" v="Mod ✅ · Admin ✅ · Master ✅" />
          <Row k="User ban/mute" v="Mod scoped (per mod config) · Admin ✅ · Master ✅" />
          <Row k="Collections / content" v="Mod ❌ · Admin ✅ · Master ✅" />
          <Row k="Notifications / banners" v="Mod ❌ · Admin ✅ · Master ✅" />
          <Row k="Ad system" v="Mod ❌ · Admin ✅ · Master ✅" />
          <Row k="Themes / Ranks / Onboarding / Settings" v="Mod ❌ · Admin ❌ · Master ✅" />
        </div>
        <P>Mod scope is further refined by <Tag>AdminModeratorConfig</Tag>. Deletion requests require admin approval.</P>
      </>
    ),
  },
  {
    id: "ads",
    title: "16. Advertising System",
    keywords: "advertising ads placements swipe navbar banner home leaderboard profile shop adsense custom hybrid popup in swipe analytics",
    body: (
      <>
        <P>Ad placements managed via JSON in <Tag>app_settings</Tag>. Seven distinct placements:</P>
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-1">
          <Row k="swipe" v="Interstitial between swipe pairs (default every 10 swipes)." />
          <Row k="navbar_banner" v="Rotating top NavBanner." />
          <Row k="home_banner" v="Home page hero / banner area." />
          <Row k="leaderboard" v="Between leaderboard rows." />
          <Row k="profile" v="On user profile pages." />
          <Row k="shop" v="Inside the Shop page." />
          <Row k="popup" v="Cross-page popup placement." />
        </div>
        <P>Each placement supports Custom uploads, AdSense (Google), or Hybrid sources. Modes: <Tag>popup</Tag>, <Tag>in_swipe</Tag>, <Tag>both</Tag>, <Tag>off</Tag>. Per-placement frequency, cooldown, max-per-session, A/B variant. Admins can disable ads for individual users. Pro users are exempt; admins/mods always see ads for QA.</P>
        <P>Engagement tracking: image-click analytics during matchups feed <Tag>AdminAdAnalytics</Tag>. AdSense publisher details live in <Tag>tech/advertising/adsense-config</Tag>.</P>
      </>
    ),
  },
  {
    id: "backend",
    title: "17. Backend / Edge Functions",
    keywords: "backend edge functions supabase lovable cloud admin emails subscription checkout customer portal preset images purge anonymous redeem snapshot verify",
    body: (
      <>
        <P>Platform: Lovable Cloud (Supabase under the hood — PostgreSQL + Auth + Realtime + Storage + Edge Functions).</P>
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-1">
          <Row k="admin-get-emails" v="Retrieves user emails for admin export (restricted)." />
          <Row k="admin-user-actions" v="Executes privileged user operations server-side (ban, role grant)." />
          <Row k="check-subscription" v="Verifies active Stripe subscription; returns subscription_end." />
          <Row k="create-checkout" v="Stripe Checkout session for Pro / Diamond packs." />
          <Row k="customer-portal" v="Stripe Customer Portal session for sub management." />
          <Row k="populate-preset-images" v="Batch-fills preset league item image URLs from a source." />
          <Row k="purge-anonymous-users" v="Cleans up stale anonymous accounts that never converted." />
          <Row k="redeem-gift" v="Validates + applies a gifted Pro/Diamond pack to recipient." />
          <Row k="snapshot-global-elo" v="Hourly point-in-time snapshot of all global Elo for stability + history." />
          <Row k="verify-gift" v="Validates a gift code before redemption." />
        </div>
      </>
    ),
  },
  {
    id: "auth",
    title: "18. Authentication",
    keywords: "auth email password google oauth anonymous account linking 2fa two factor reset protected route admin route session cache",
    body: (
      <UL>
        <li><strong>Email/password</strong> — standard Supabase Auth with email confirmation.</li>
        <li><strong>Google OAuth</strong> — one-click sign-in.</li>
        <li><strong>Anonymous accounts</strong> — visitors can swipe immediately; sessions accumulate Aura + history.</li>
        <li><strong>Anonymous → real linking</strong> — converts anonymous progress into the real account without data loss.</li>
        <li><strong>2FA</strong> — TOTP via <Tag>TwoFactorAuth</Tag> component.</li>
        <li><strong>Password reset</strong> — <Tag>/reset-password</Tag> handles Supabase RECOVERY event.</li>
        <li><strong>Route guards</strong> — <Tag>ProtectedRoute</Tag> (auth) + <Tag>AdminRoute</Tag> (role check).</li>
        <li><strong>Session cache</strong> — React Query cache invalidated on auth state change via <Tag>useAuthQuerySync</Tag>.</li>
      </UL>
    ),
  },
  {
    id: "slugs",
    title: "19. Custom Links / Slug System",
    keywords: "custom links slug resolve rpc swipe tab config buttons visits redirect",
    body: (
      <>
        <P>The <Tag>CustomLink</Tag> page (<Tag>/:slug</Tag>) is a universal redirect layer:</P>
        <UL>
          <li>Checks <Tag>swipe_tab_config.button_slugs</Tag> first (button-mapped slugs).</li>
          <li>Falls back to the <Tag>custom_links</Tag> table via the <Tag>resolve_custom_link</Tag> RPC.</li>
          <li>On resolution calls <Tag>increment_custom_link_visits</Tag> for analytics.</li>
          <li>Redirects to: swipe session, league page, internal route, or external URL.</li>
        </UL>
        <P>Admins manage slugs in <Tag>AdminCustomLinks</Tag>.</P>
      </>
    ),
  },
  {
    id: "blog",
    title: "20. Blog System",
    keywords: "blog blocks rich tiptap chart leaderboard profile card item card share home blog strip theme wrapper",
    body: (
      <>
        <H>Admin side</H>
        <UL>
          <li>Post list — search, status filter (draft/published/archived), tag filter.</li>
          <li>Bulk select + batch publish/archive/delete.</li>
          <li>Create with title + editor mode selection.</li>
        </UL>
        <H>Editor (AdminBlogEditor)</H>
        <UL>
          <li><strong>Blocks mode</strong> (<Tag>BlocksEditor</Tag>) — heading, paragraph, image, divider, embed, code, and data blocks.</li>
          <li><strong>Rich mode</strong> — TipTap / ProseMirror with inline widget insertion.</li>
        </UL>
        <H>Data blocks (live)</H>
        <UL>
          <li><Tag>ChartBlock</Tag> — bar/line charts from provided data.</li>
          <li><Tag>LeaderboardBlock</Tag> — embeds a live league leaderboard.</li>
          <li><Tag>ProfileCardBlock</Tag> — inline Mogsy profile card.</li>
          <li><Tag>ItemCardBlock</Tag> — inline play item card.</li>
        </UL>
        <H>Public rendering</H>
        <UL>
          <li><Tag>BlogRenderer</Tag> / <Tag>BlockRenderer</Tag> on the public post page.</li>
          <li><Tag>BlogThemeWrapper</Tag> applies per-post color themes.</li>
          <li><Tag>BlogShareButtons</Tag> — Twitter/X, copy link, etc.</li>
          <li><Tag>HomeBlogStrip</Tag> surfaces 3 latest published posts on Home.</li>
        </UL>
      </>
    ),
  },
  {
    id: "aesthetic",
    title: "21. Aesthetic & Design System",
    keywords: "aesthetic design system dark base 0a0a1a max-w-7xl typography blur glassmorphism framer motion sounds seo z-index",
    body: (
      <UL>
        <li><strong>Base color</strong> — <Tag>#0a0a1a</Tag> deep navy-black. Dark-first.</li>
        <li><strong>Max width</strong> — <Tag>max-w-7xl mx-auto</Tag> centered container with responsive padding.</li>
        <li><strong>Typography</strong> — system sans stack with weighted headings; Inter/SF Pro-style hierarchy.</li>
        <li><strong>Dual-layer blurred backgrounds</strong> — duplicate <Tag>object-cover scale-110 blur-xl opacity-20</Tag> for visual parity without letterboxing.</li>
        <li><strong>Glassmorphism cards</strong> — <Tag>backdrop-blur</Tag> over gradient orb backgrounds.</li>
        <li><strong>Animations</strong> — <Tag>framer-motion</Tag> for transitions; canvas-based for swipe outcomes.</li>
        <li><strong>Sounds</strong> — per-animation SFX, shop sounds, UI feedback via <Tag>useAnimationSound</Tag> / <Tag>useShopSound</Tag>.</li>
        <li><strong>Z-index hierarchy</strong> — z-[70] cards · z-60 global · z-50 fixed nav · z-40 mobile action bar · z-30 bleeds.</li>
        <li><strong>Apple-like language</strong> — <Tag>rounded-xl</Tag> / <Tag>rounded-2xl</Tag>, subtle shadows, generous spacing, minimal chrome.</li>
        <li><strong>SEO</strong> — <Tag>SEOHead</Tag> on every page with dynamic title, meta, OG tags. Primary domain <Tag>mogsy.net</Tag>.</li>
      </UL>
    ),
  },
  {
    id: "stack",
    title: "22. Tech Stack",
    keywords: "tech stack react vite tailwind shadcn radix framer motion tanstack query supabase stripe react router tiptap html2canvas gif",
    body: (
      <div className="rounded-lg border border-border bg-card/40 p-4 space-y-1">
        <Row k="Framework" v="React 18 + TypeScript" />
        <Row k="Build" v="Vite 5" />
        <Row k="Styling" v="Tailwind CSS v3 + semantic design tokens" />
        <Row k="UI" v="shadcn/ui (Radix primitives)" />
        <Row k="Animation" v="framer-motion" />
        <Row k="Data" v="TanStack React Query v5" />
        <Row k="Backend" v="Lovable Cloud (Supabase: Postgres / Realtime / Auth / Storage)" />
        <Row k="Payments" v="Stripe via edge functions" />
        <Row k="Routing" v="React Router v6" />
        <Row k="Rich text" v="TipTap / ProseMirror (blog editor)" />
        <Row k="GIF export" v={<><Tag>useGifExport</Tag> (canvas-based)</>} />
        <Row k="Screenshot" v={<><Tag>useScreenshot</Tag> (html2canvas)</>} />
        <Row k="Hosting" v="Lovable Cloud" />
      </div>
    ),
  },
  {
    id: "naming",
    title: "23. Internal Naming Map",
    keywords: "naming map user facing internal aura elo leaderboard rankings collections preset compete user leagues",
    body: (
      <div className="rounded-lg border border-border bg-card/40 p-4 space-y-1">
        <Row k="Aura" v="Internal: Elo / elo / score columns" />
        <Row k="Leaderboard" v="Internal: Rankings / local_rankings / leaderboard tables" />
        <Row k="Collections" v="Internal: Preset Leagues" />
        <Row k="Compete" v="Internal: User Leagues" />
        <Row k="Tier" v="Internal: percentile rank thresholds in app_settings" />
        <Row k="Diamond" v="Internal: currency / token balance" />
      </div>
    ),
  },
  {
    id: "recent-updates",
    title: "24. Recent Updates",
    keywords:
      "recent updates changelog quiz league quiz quiz admin quiz diagnostics quiz reports report issue lol hub tier list combat lab diagnostics rewind security override question",
    body: (
      <>
        <P>
          Highlights shipped since this reference was last refreshed. Older mechanics are documented in
          their dedicated sections above.
        </P>

        <H>League Quiz (<Tag>/quiz</Tag>)</H>
        <UL>
          <li>
            New standalone quiz experience driven by the generator in <Tag>src/lib/quiz/api.ts</Tag>.
            Questions are sourced from league data and answered head-to-head style.
          </li>
          <li>
            <strong>Report issue</strong> button appears after a question is answered. Opens a dialog with
            report type dropdown (<Tag>wrong_answer</Tag>, <Tag>confusing_question</Tag>,{" "}
            <Tag>wrong_image</Tag>, <Tag>typo</Tag>, <Tag>other</Tag>), optional "what you chose",
            "what it should be", and free-form notes. Submits to <Tag>quizApi.reportQuestion()</Tag> →
            <Tag>POST /api/quiz/reports</Tag>. Pre-fills <Tag>question_id</Tag> and the user's selected
            answer. Reports never mutate the live answer.
          </li>
        </UL>

        <H>Quiz Admin (<Tag>/quiz/admin</Tag>)</H>
        <UL>
          <li>
            New admin review surface for user-submitted quiz reports. Tabs for Open / Resolved / All,
            with per-report actions: <strong>Mark fixed</strong>, <strong>Mark invalid</strong>, or{" "}
            <strong>Apply override</strong>.
          </li>
          <li>
            Override dialog edits the live correct answer, explanation, and admin notes. Backed by{" "}
            <Tag>quizApi.getReports()</Tag>, <Tag>quizApi.resolveReport()</Tag>, and{" "}
            <Tag>quizApi.overrideQuestion()</Tag>.
          </li>
          <li>
            Warning banner reminds admins that overrides patch the live quiz immediately but do{" "}
            <em>not</em> propagate back to the source generator data.
          </li>
          <li>Linked from <Tag>/quiz/diagnostics</Tag> for quick triage.</li>
        </UL>

        <H>Quiz Diagnostics (<Tag>/quiz/diagnostics</Tag>)</H>
        <P>
          Internal diagnostics surface for inspecting generated quiz questions, validating data shape, and
          jumping into the Quiz Admin review queue.
        </P>

        <H>LoL Hub & Tier List</H>
        <UL>
          <li><Tag>/lol</Tag> — landing hub for League of Legends-themed content.</li>
          <li><Tag>/lol/tier-list</Tag> — community tier list view.</li>
        </UL>

        <H>Combat Lab Diagnostics</H>
        <P>
          <Tag>/combat-lab/diagnostics</Tag> added for inspecting Combat Lab champion data and matchup
          generation. Combat Lab gameplay itself is unchanged.
        </P>

        <H>Security Hardening</H>
        <UL>
          <li>
            <Tag>public.rewind_user_match</Tag> rewritten to prevent ELO injection: caller must be a
            match participant, ELO bounds-checked (0–5000), deltas clamped to ±32 and validated zero-sum,
            a recent (≤24h) recorded match between the two profiles in the league is required, the
            original match row is deleted on rewind, and one rewind charge is deducted from the caller.
          </li>
          <li>
            Profile directory + friends hooks tightened to read user info exclusively through the{" "}
            <Tag>public_profiles</Tag> view so RLS on <Tag>profiles</Tag> is respected.
          </li>
        </UL>

        <H>Quiz API surface (<Tag>src/lib/quiz/api.ts</Tag>)</H>
        <UL>
          <li><Tag>reportQuestion(payload)</Tag> — user-facing report submission.</li>
          <li><Tag>getReports(status?)</Tag> — admin list with optional status filter.</li>
          <li><Tag>resolveReport(reportId, payload)</Tag> — mark fixed / invalid.</li>
          <li><Tag>overrideQuestion(payload)</Tag> — live-patch correct answer + explanation.</li>
          <li>
            <Tag>QuizQuestion</Tag> type now exposes both <Tag>question_key</Tag> and{" "}
            <Tag>question_text</Tag>.
          </li>
        </UL>
      </>
    ),
  },
];

export default function AdminAbout() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!q) return sections;
    return sections.filter(
      (s) => s.title.toLowerCase().includes(q) || s.keywords.includes(q),
    );
  }, [q]);

  return (
    <div className="min-h-dvh px-3 sm:px-4 py-4 sm:py-8">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <Info className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
          <h1 className="text-xl sm:text-3xl font-extrabold text-foreground">About Mogsy</h1>
          <span className="text-[10px] sm:text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            Admin reference
          </span>
          <Link
            to="/admin"
            className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Admin
          </Link>
        </div>

        <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
          An internal, hand-maintained reference covering every page, mechanic, admin tool, and aesthetic
          decision in Mogsy. Use it to brief new admins/moderators, write marketing copy, or audit scope.
          This page is not linked publicly.
        </p>

        {/* Search */}
        <div className="sticky top-2 z-40 mb-6">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sections (e.g. 'aura', 'ads', 'multiplayer')..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-card/80 backdrop-blur text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 lg:gap-8">
          {/* Sticky TOC */}
          <aside className="hidden lg:block">
            <nav className="sticky top-16 space-y-1">
              {visible.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block text-xs leading-snug text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded-md hover:bg-secondary/60"
                >
                  {s.title}
                </a>
              ))}
              <a
                href="#top"
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline px-2"
              >
                <ChevronUp className="h-3 w-3" /> Back to top
              </a>
            </nav>
          </aside>

          {/* Content */}
          <main id="top" className="space-y-8 min-w-0">
            {visible.length === 0 && (
              <p className="text-sm text-muted-foreground">No sections match "{query}".</p>
            )}
            {visible.map((s) => (
              <section
                key={s.id}
                id={s.id}
                className="scroll-mt-24 rounded-2xl border border-border bg-card/30 p-5 sm:p-6"
              >
                <h2 className="text-lg sm:text-xl font-extrabold text-foreground mb-3">{s.title}</h2>
                {s.body}
              </section>
            ))}
          </main>
        </div>
      </div>
    </div>
  );
}
