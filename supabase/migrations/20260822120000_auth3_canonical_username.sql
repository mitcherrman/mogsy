-- ---------------------------------------------------------------------------
-- AUTH3 — profiles.display_name becomes the canonical public Mogzy identity.
--
-- WHAT THE AUDIT FOUND. Mogzy has exactly ONE public-name column and it is
-- profiles.display_name. There is no `username` column, no `profile_name`, no
-- Ranked-side player name: the Welcome register's "username", the onboarding
-- "Display Name", the profile editor, the leaderboard, the Ranked lobby hero
-- and the admin directory all read or write this one column. The identity
-- model was therefore already single-field — what it lacked was AUTHORITY:
--
--   * no uniqueness of any kind, in the database or the client;
--   * three different validation regimes on the three surfaces that write it
--     (2..24 + charset at /welcome, profanity-only in the profile editor and
--     in onboarding, <= 60 in the admin bot RPC, <= 50 in the table CHECK);
--   * handle_new_user() minting anonymous placeholders as
--     'Anonymous' || (SELECT count(*)+1 FROM profiles WHERE is_anonymous),
--     which is not unique — it collides after any purge and races two
--     concurrent guest sign-ins onto the same name.
--
-- This migration makes the database the authority for all three, without
-- renaming a single existing account.
--
-- THE INDEX IS CONDITIONAL, AND THAT IS DELIBERATE. A live table that has
-- never enforced uniqueness may already hold case-insensitive duplicates, and
-- CREATE UNIQUE INDEX against duplicated data fails — which, in a project
-- where master auto-deploys, would mean a migration that aborts the whole
-- deploy for a data condition nobody can see from the client. So the index is
-- attempted inside an exception block: it is created when the data allows and
-- SKIPPED WITH A WARNING when it does not. Enforcement does not depend on it —
-- set_display_name() below checks uniqueness itself, in the same statement
-- that writes, and it is the only path any client uses. The index is the
-- backstop; the RPC is the authority. `public.display_name_conflicts` shows an
-- admin exactly what is blocking the backstop, and
-- `public.enforce_display_name_uniqueness()` installs it once they are clear.
--
-- NOTHING HERE REWRITES A NAME. Not a duplicate, not an 'Anonymous<n>', not an
-- empty one. Existing accounts keep exactly the name they have; the rules bind
-- the NEXT write. A user who is sitting on a duplicate today keeps it until
-- they choose to rename, and then they are told it is taken like anyone else.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Normalisation — the comparison form of a name.
--
-- Display keeps the capitalisation the user chose; comparison does not. This
-- is the whole of "MogzyKing and mogzyking are the same name". Whitespace is
-- collapsed and trimmed first so " Mogzy  King " cannot become a second
-- identity that merely LOOKS like "Mogzy King" in every UI that renders it.
--
-- IMMUTABLE because a partial unique index is built on it. lower() is
-- collation-dependent in principle, but the index and every caller live in the
-- same database with the same collation, and re-normalising on read is not a
-- thing this schema does.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_display_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT lower(btrim(regexp_replace(COALESCE(_name, ''), '\s+', ' ', 'g')));
$$;

COMMENT ON FUNCTION public.normalize_display_name(text) IS
  'AUTH3: comparison form of a public username. Whitespace-collapsed, trimmed, lower-cased. Display form keeps the user''s own capitalisation.';


-- ---------------------------------------------------------------------------
-- 2. The display form — what actually gets stored.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clean_display_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT btrim(regexp_replace(COALESCE(_name, ''), '\s+', ' ', 'g'));
$$;


-- ---------------------------------------------------------------------------
-- 3. Reserved names — kept deliberately tiny.
--
-- Two categories only, each with a concrete product reason:
--
--   * the placeholder handle_new_user() generates. A person choosing to be
--     called "Anonymous", or "Anonymous Wizard", is choosing a name and keeps
--     it; 'Anonymous5472' exactly is the SYSTEM's word for "nobody has said
--     yet", and letting an account claim one makes every placeholder in the
--     product ambiguous.
--   * a seven-word system namespace. Impersonating Mogzy itself or a
--     moderator is the one impersonation that can be used to extract something
--     from another player.
--
-- That is the entire list, and it is meant to stay that way. General abusive
-- names are handled by the existing profanity filter on the client
-- (src/lib/profanity-filter.ts), which AUTH3 shares across all three writing
-- surfaces rather than replacing. Moderation is not being built here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_reserved_display_name(_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT public.normalize_display_name(_name) ~ '^anonymous[0-9]+$'
      OR public.normalize_display_name(_name) IN (
           'admin', 'administrator', 'moderator', 'system', 'support',
           'mogzy', 'mogsy'
         );
$$;


-- ---------------------------------------------------------------------------
-- 4. Validation — ONE rule set, and the database owns it.
--
-- 2..24 characters. Letters, digits, spaces, and . _ ' - only.
--
-- The bounds and the character class are lifted verbatim from the Welcome
-- register (src/lib/welcome/academy-registration.ts), which is the only
-- surface that ever had a real policy and which has already been shipping
-- names under it. Narrowing the ceiling to 20 would start rejecting names
-- Mogzy has itself already accepted and written, for no product gain; the
-- table's own CHECK (<= 50) stays as the outer bound it always was.
--
-- [[:alnum:]] is locale-aware in a UTF-8 database, so this accepts the same
-- accented and non-Latin letters the client's \p{L}\p{N} class does. The class
-- is an ALLOW-LIST, which is what keeps control characters, zero-width joiners
-- and direction overrides out without a separate blocklist for each.
--
-- Returns a machine-readable code so every caller — RPC, trigger, client —
-- renders the same sentence for the same failure.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.display_name_problem(_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  cleaned text := public.clean_display_name(_name);
BEGIN
  IF char_length(cleaned) < 2 THEN RETURN 'too_short'; END IF;
  IF char_length(cleaned) > 24 THEN RETURN 'too_long'; END IF;
  IF cleaned !~ '^[[:alnum:] ._''-]+$' THEN RETURN 'invalid_characters'; END IF;
  IF public.is_reserved_display_name(cleaned) THEN RETURN 'reserved'; END IF;
  RETURN NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. Which rows the uniqueness rule binds.
--
-- A CHOSEN name, and only a chosen name. The two kinds of row excluded are
-- excluded because they are not identities anyone picked:
--
--   * '' — what handle_new_user() writes for a signup that carried no name.
--     Every one of them would collide with every other.
--   * 'Anonymous<n>' on a row still flagged anonymous — the generated
--     placeholder. Once an account converts, whatever its name says is the
--     name it kept, and from then on it is bound like anyone else's.
--
-- This is the same placeholder test the client already applies in
-- src/lib/welcome/provisional-identity.ts (isPlaceholderDisplayName), and the
-- two must stay in step.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_claimed_display_name(_name text, _is_anonymous boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT public.normalize_display_name(_name) <> ''
     AND NOT (
       COALESCE(_is_anonymous, false)
       AND public.normalize_display_name(_name) ~ '^anonymous[0-9]+$'
     );
$$;


-- ---------------------------------------------------------------------------
-- 6. The backstop index — attempted, never allowed to abort the deploy.
--
-- Also exposed as a callable function so an admin can install it later, from
-- the SQL editor, once display_name_conflicts is empty. Idempotent: running it
-- against a database that already has the index is a no-op that reports so.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_display_name_uniqueness()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  conflicts integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'profiles_display_name_unique_ci') THEN
    RETURN 'already_enforced';
  END IF;

  SELECT count(*) INTO conflicts FROM (
    SELECT 1
      FROM public.profiles
     WHERE public.is_claimed_display_name(display_name, is_anonymous)
     GROUP BY public.normalize_display_name(display_name)
    HAVING count(*) > 1
  ) d;

  IF conflicts > 0 THEN
    RETURN 'blocked:' || conflicts;
  END IF;

  CREATE UNIQUE INDEX profiles_display_name_unique_ci
      ON public.profiles (public.normalize_display_name(display_name))
   WHERE public.is_claimed_display_name(display_name, is_anonymous);

  RETURN 'enforced';
END;
$$;

COMMENT ON FUNCTION public.enforce_display_name_uniqueness() IS
  'AUTH3: install the case-insensitive uniqueness backstop on profiles.display_name. Returns enforced | already_enforced | blocked:<n>. Safe to re-run.';

DO $$
DECLARE
  outcome text;
BEGIN
  outcome := public.enforce_display_name_uniqueness();
  IF outcome LIKE 'blocked:%' THEN
    RAISE WARNING
      'AUTH3: profiles.display_name uniqueness index NOT installed — % duplicate name group(s) already exist. Uniqueness is still enforced for every new write by public.set_display_name(). Review public.display_name_conflicts, then call public.enforce_display_name_uniqueness().',
      split_part(outcome, ':', 2);
  ELSE
    RAISE NOTICE 'AUTH3: display_name uniqueness -> %', outcome;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7. What is blocking the backstop. Admin-only: it lists other people's names
-- alongside their user ids, which is exactly the join no player may run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.display_name_conflicts AS
  SELECT public.normalize_display_name(p.display_name) AS normalized,
         count(*)                                      AS holders,
         array_agg(p.display_name ORDER BY p.created_at) AS spellings,
         array_agg(p.user_id      ORDER BY p.created_at) AS user_ids
    FROM public.profiles p
   WHERE public.is_claimed_display_name(p.display_name, p.is_anonymous)
     AND public.has_role(auth.uid(), 'admin'::public.app_role)
   GROUP BY public.normalize_display_name(p.display_name)
  HAVING count(*) > 1;

REVOKE ALL ON public.display_name_conflicts FROM anon, authenticated, public;
GRANT SELECT ON public.display_name_conflicts TO authenticated;


-- ---------------------------------------------------------------------------
-- 8. is_display_name_available — the UX precheck.
--
-- ADVISORY ONLY, and named as such in the client. Between this answering
-- "free" and the user pressing the button, someone else can take the name;
-- set_display_name() is what actually decides, and it decides in the same
-- statement that writes. This exists so the common case is answered before the
-- form is submitted, not so the client can enforce anything.
--
-- Returns the SAME code vocabulary as set_display_name so one mapper in the
-- client renders both.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_display_name_available(_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cleaned text := public.clean_display_name(_name);
  problem text := public.display_name_problem(_name);
BEGIN
  IF problem IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', problem);
  END IF;

  -- The caller's OWN current name is available to the caller. Without this,
  -- re-saving a profile form without touching the name reports it taken.
  IF EXISTS (
    SELECT 1 FROM public.profiles
     WHERE public.is_claimed_display_name(display_name, is_anonymous)
       AND public.normalize_display_name(display_name) = public.normalize_display_name(cleaned)
       AND user_id IS DISTINCT FROM auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'taken');
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'available', 'display_name', cleaned);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_display_name_available(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_display_name_available(text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 9. set_display_name — THE write path for a public username.
--
-- Every client surface that sets a name goes through this: signup, the guest
-- upgrade, the Welcome adoption, and the profile rename. It replaces four
-- separate `profiles.update({ display_name })` calls that each had their own
-- idea of what a valid name was and none of which could see another account.
--
-- SECURITY DEFINER because uniqueness is a statement about rows the caller
-- cannot read: RLS lets a player see their own profile, so a check written as
-- the caller would find no conflict with anyone and happily mint a duplicate.
-- The elevation is bounded hard — auth.uid() is the only row that can be
-- written, one column, and _target_user_id is not a parameter at all.
--
-- ANONYMOUS GUESTS MAY CALL THIS. They are `authenticated` with an anonymous
-- JWT, they own a profile row, and a guest choosing their name before they
-- ever have an email is precisely the flow AUTH3 exists to allow. Their name
-- becomes a claimed one the moment they set it, and it survives the in-place
-- conversion to a permanent account untouched, because the conversion never
-- changes the auth uid.
--
-- FIRST-WRITE-WINS IS THE CALLER'S RULE, NOT THIS ONE. `_only_if_unset` lets
-- the Welcome adoption keep its "never overwrite a chosen name" semantics
-- without a read-then-write race, while a deliberate rename passes false and
-- overwrites its own name freely. Renaming is free, uncapped and never
-- charged for: no cooldown exists today and this does not add one.
--
-- Returns jsonb, never raises, and never leaks a Postgres error string. A
-- unique-violation from the backstop index (a genuine race between the check
-- and the write) is caught and reported as the same friendly 'taken' as the
-- ordinary case, so the two are indistinguishable to the user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_display_name(
  _name          text,
  _only_if_unset boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid       uuid := auth.uid();
  cleaned   text := public.clean_display_name(_name);
  problem   text := public.display_name_problem(_name);
  current   public.profiles%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthenticated');
  END IF;

  SELECT * INTO current FROM public.profiles WHERE user_id = uid;
  IF NOT FOUND THEN
    -- handle_new_user() owns creating profile rows. A row that has not landed
    -- yet is a "not yet", never an INSERT from here: manufacturing one would
    -- be the duplicate-identity bug this whole change exists to close.
    RETURN jsonb_build_object('ok', false, 'code', 'no_profile');
  END IF;

  -- First-write-wins, evaluated BEFORE validation so a caller in this mode is
  -- never handed an error about a name it was not going to write anyway.
  IF _only_if_unset
     AND public.is_claimed_display_name(current.display_name, current.is_anonymous) THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already_set',
                              'display_name', current.display_name);
  END IF;

  IF problem IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', problem);
  END IF;

  -- Already ours, in some capitalisation. Fall through to the write so that
  -- "mogzyking" -> "MogzyKing" is a legal re-capitalisation of one's own name
  -- rather than a collision with oneself.
  IF EXISTS (
    SELECT 1 FROM public.profiles
     WHERE public.is_claimed_display_name(display_name, is_anonymous)
       AND public.normalize_display_name(display_name) = public.normalize_display_name(cleaned)
       AND user_id IS DISTINCT FROM uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'taken');
  END IF;

  BEGIN
    UPDATE public.profiles SET display_name = cleaned WHERE user_id = uid;
  EXCEPTION
    WHEN unique_violation THEN
      -- Lost a race with a concurrent claim between the check above and this
      -- write. Same outcome, same sentence.
      RETURN jsonb_build_object('ok', false, 'code', 'taken');
  END;

  RETURN jsonb_build_object('ok', true, 'code', 'set', 'display_name', cleaned);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_display_name(text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_display_name(text, boolean) TO authenticated;

COMMENT ON FUNCTION public.set_display_name(text, boolean) IS
  'AUTH3: the single write path for a public Mogzy username. Validates, enforces case-insensitive uniqueness, preserves chosen capitalisation. Returns jsonb {ok, code, display_name}; codes: set | already_set | taken | too_short | too_long | invalid_characters | reserved | unauthenticated | no_profile.';


-- ---------------------------------------------------------------------------
-- 10. handle_new_user — carry the chosen name in, and stop minting colliding
--     placeholders.
--
-- TWO CHANGES, BOTH NARROW.
--
-- (a) The anonymous placeholder was 'Anonymous' || (count of anonymous
--     profiles + 1). That count goes DOWN whenever purge-anonymous-users runs,
--     so the generator reissues names it has already handed out, and two guests
--     signing in at the same moment read the same count and get the same name.
--     Now: a random 4-digit suffix, retried until free, with a uuid-derived
--     fallback that cannot loop forever. Placeholders are not identities, but
--     they are shown to admins and used by the client to decide whether a name
--     was ever chosen, so two accounts sharing one is a real defect.
--
-- (b) A real signup's display_name comes from raw_user_meta_data, which is now
--     actually populated: useAuth.signUp() passes the username the visitor
--     chose at /welcome (or typed on the signup form) as options.data
--     .display_name. The name is accepted here only if it is VALID and FREE —
--     otherwise the row is created with '' and the client's post-signup claim
--     reports 'taken' and asks for another. A trigger on auth.users must never
--     raise: failing the insert would fail the signup itself, turning "that
--     name is taken" into "your account could not be created".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  anon_name  text;
  attempt    integer := 0;
  wanted     text;
BEGIN
  IF NEW.is_anonymous = true THEN
    LOOP
      attempt := attempt + 1;
      anon_name := 'Anonymous' || lpad((floor(random() * 10000))::int::text, 4, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.profiles
         WHERE public.normalize_display_name(display_name)
             = public.normalize_display_name(anon_name)
      );
      IF attempt >= 12 THEN
        -- Bounded: never spin on a saturated namespace. The uid fragment is
        -- unique by construction, and this placeholder is replaced the moment
        -- the guest chooses a name.
        anon_name := 'Anonymous' || substr(replace(NEW.id::text, '-', ''), 1, 8);
        EXIT;
      END IF;
    END LOOP;

    INSERT INTO public.profiles (user_id, display_name, is_anonymous)
    VALUES (NEW.id, anon_name, true);
  ELSE
    wanted := public.clean_display_name(NEW.raw_user_meta_data->>'display_name');

    IF wanted = ''
       OR public.display_name_problem(wanted) IS NOT NULL
       OR EXISTS (
            SELECT 1 FROM public.profiles
             WHERE public.is_claimed_display_name(display_name, is_anonymous)
               AND public.normalize_display_name(display_name)
                 = public.normalize_display_name(wanted)
          )
    THEN
      -- Not usable. '' is the long-standing "no name yet" value and the client
      -- treats it as a placeholder, so the signup completes and the user is
      -- asked for a different name rather than being refused an account.
      wanted := '';
    END IF;

    INSERT INTO public.profiles (user_id, display_name)
    VALUES (NEW.id, wanted);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
