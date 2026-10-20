// Notifications 2.0 — PGlite fixture.
//
// Reproduces the production shape of every table the v2 migration touches, as
// the repository's migrations leave it (columns, RLS policies and the trigger
// producers, copied from their final applied bodies), then runs the REAL
// 20260803121000 per-admin receipts migration and, on request, the REAL v2
// migration. Supabase is represented by what it actually contributes: the
// anon/authenticated roles with Supabase's default privileges, auth.uid(), a
// realtime publication and has_role() resolved from user_roles.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

export const PER_ADMIN_READS = read("supabase/migrations/20260803121000_admin_notification_per_admin_reads.sql");
export const V2 = read("supabase/migrations/20261019120000_notifications_v2_lifecycle.sql");
export const PREFLIGHT = read("supabase/verification/notifications_v2_preflight.sql");
export const VERIFY = read("supabase/verification/notifications_v2_verify.sql");
export const ROLLBACK = read("supabase/verification/notifications_v2_rollback.sql");

export const FIXTURE = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  CREATE TABLE public._ctx (uid uuid);
  INSERT INTO public._ctx VALUES (NULL);
  GRANT SELECT ON public._ctx TO anon, authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT uid FROM public._ctx LIMIT 1 $$;
  CREATE PUBLICATION supabase_realtime;

  CREATE TYPE public.app_role AS ENUM ('master_admin', 'admin', 'moderator');
  CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE (user_id, role));
  CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id
                     AND (r.role = _role OR (r.role = 'master_admin' AND _role = 'admin')))
    $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    display_name text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE FUNCTION public.is_profile_owner(_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _profile_id AND user_id = auth.uid())
    $$;
  CREATE FUNCTION public.system_notification_actor() RETURNS uuid LANGUAGE sql IMMUTABLE
    AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;

  -- admin_notifications: 20260222074007 + policies as of 20260802120000.
  CREATE TABLE public.admin_notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    type text NOT NULL DEFAULT 'image_report',
    title text NOT NULL,
    message text,
    is_read boolean NOT NULL DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Admins can read notifications" ON public.admin_notifications
    FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
  CREATE POLICY "Admins can update notifications" ON public.admin_notifications
    FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
  CREATE POLICY "Moderators can raise delete requests" ON public.admin_notifications
    FOR INSERT TO authenticated WITH CHECK (type = 'mod_delete_request'
      AND (public.has_role(auth.uid(), 'moderator'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)));
  ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;

  -- user_notifications / reads: 20260225115950 + 20260225121200 + 20260520093257.
  CREATE TABLE public.user_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    title text NOT NULL,
    message text,
    type text NOT NULL DEFAULT 'general',
    image_url text,
    profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    sent_by_user_id uuid NOT NULL,
    target_type text NOT NULL DEFAULT 'all',
    is_sent boolean NOT NULL DEFAULT true,
    action_url text DEFAULT NULL,
    priority text NOT NULL DEFAULT 'normal',
    emoji text DEFAULT NULL
  );
  CREATE TABLE public.user_notification_reads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id uuid NOT NULL REFERENCES public.user_notifications(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    read_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (notification_id, user_id)
  );
  ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_notification_reads ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can read broadcast or own targeted notifications" ON public.user_notifications
    FOR SELECT TO authenticated USING (target_type = 'all' OR has_role(auth.uid(), 'admin'::app_role)
      OR (profile_id IS NOT NULL AND public.is_profile_owner(profile_id)));
  CREATE POLICY "Admins can insert notifications" ON public.user_notifications
    FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  CREATE POLICY "Users can read own reads" ON public.user_notification_reads
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
  CREATE POLICY "Users can insert own reads" ON public.user_notification_reads
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;

  -- Workflow tables, the columns the notification paths read.
  CREATE TABLE public.feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    category text NOT NULL DEFAULT 'general',
    title text NOT NULL DEFAULT '',
    body text,
    status text NOT NULL DEFAULT 'open',
    priority text NOT NULL DEFAULT 'normal',
    admin_notes text,
    is_archived boolean NOT NULL DEFAULT false,
    entry_intent text, type text, severity text,
    evidence_url text, screenshot_path text, page_url text,
    report_context jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.user_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason text NOT NULL DEFAULT 'inappropriate',
    details text,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
  );
  CREATE TABLE public.comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content text NOT NULL,
    is_hidden boolean NOT NULL DEFAULT false,
    hidden_by_admin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.comment_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
    reporter_profile_id uuid NOT NULL,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.friendships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    addressee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (requester_id, addressee_id)
  );

  -- Producers, final applied bodies (20260523081658 / 20260823120000).
  CREATE FUNCTION public.check_and_auto_hide_comment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
  DECLARE _report_count integer; _comment_content text;
  BEGIN
    SELECT COUNT(*) INTO _report_count FROM public.comment_reports WHERE comment_id = NEW.comment_id;
    SELECT LEFT(content, 100) INTO _comment_content FROM public.comments WHERE id = NEW.comment_id;
    INSERT INTO public.admin_notifications (type, title, message, metadata)
    VALUES ('comment_report', 'Comment reported',
      COALESCE(_comment_content, 'A comment was reported.') || ' (' || _report_count || ' total)',
      jsonb_build_object('comment_id', NEW.comment_id, 'report_count', _report_count, 'reason', NEW.reason));
    IF _report_count >= 5 THEN
      UPDATE public.comments SET is_hidden = true, hidden_by_admin = false
      WHERE id = NEW.comment_id AND is_hidden = false;
      IF FOUND THEN
        INSERT INTO public.admin_notifications (type, title, message, metadata)
        VALUES ('comment_report', 'Comment auto-hidden',
          'A comment received ' || _report_count || ' reports and was automatically hidden.',
          jsonb_build_object('comment_id', NEW.comment_id, 'report_count', _report_count, 'auto_hidden', true));
      END IF;
    END IF;
    RETURN NEW;
  END; $f$;
  CREATE TRIGGER comment_reports_auto_hide AFTER INSERT ON public.comment_reports
    FOR EACH ROW EXECUTE FUNCTION public.check_and_auto_hide_comment();

  CREATE FUNCTION public.notify_admins_on_feedback() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
  BEGIN
    INSERT INTO public.admin_notifications (type, title, message, metadata)
    VALUES ('feedback', 'New feedback: ' || COALESCE(LEFT(NEW.title, 80), NEW.category),
      LEFT(COALESCE(NEW.body, ''), 200),
      jsonb_build_object('feedback_id', NEW.id, 'category', NEW.category, 'priority', NEW.priority));
    RETURN NEW;
  END; $f$;
  CREATE TRIGGER feedback_admin_notify AFTER INSERT ON public.feedback
    FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_feedback();

  CREATE FUNCTION public.notify_admins_on_user_report() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
  BEGIN
    INSERT INTO public.admin_notifications (type, title, message, metadata)
    VALUES ('user_report', 'User reported', 'Reason: ' || NEW.reason,
      jsonb_build_object('user_report_id', NEW.id, 'reported_profile_id', NEW.reported_profile_id,
                         'reporter_profile_id', NEW.reporter_profile_id, 'reason', NEW.reason));
    RETURN NEW;
  END; $f$;
  CREATE TRIGGER user_reports_admin_notify AFTER INSERT ON public.user_reports
    FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_user_report();

  CREATE FUNCTION public.notify_on_friendship_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
  DECLARE _requester_name text; _addressee_name text;
  BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      SELECT display_name INTO _requester_name FROM public.profiles WHERE id = NEW.requester_id;
      INSERT INTO public.user_notifications (title, message, type, profile_id, target_type, sent_by_user_id, is_sent, metadata)
      VALUES (COALESCE(_requester_name, 'Someone') || ' sent you a friend request', NULL, 'friend_request',
        NEW.addressee_id, 'user', public.system_notification_actor(), true,
        jsonb_build_object('friendship_id', NEW.id, 'requester_profile_id', NEW.requester_id));
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND COALESCE(OLD.status, '') <> 'accepted' THEN
      SELECT display_name INTO _addressee_name FROM public.profiles WHERE id = NEW.addressee_id;
      INSERT INTO public.user_notifications (title, message, type, profile_id, target_type, sent_by_user_id, is_sent, metadata)
      VALUES (COALESCE(_addressee_name, 'Someone') || ' accepted your friend request', NULL, 'friend_accepted',
        NEW.requester_id, 'user', public.system_notification_actor(), true,
        jsonb_build_object('friendship_id', NEW.id, 'addressee_profile_id', NEW.addressee_id));
    END IF;
    RETURN NEW;
  END; $f$;
  CREATE TRIGGER friendships_notify AFTER INSERT OR UPDATE ON public.friendships
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_friendship_change();
`;

export async function bootNotificationsDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE);
  return db;
}

/** Act as `uid` (or as anon with uid NULL) with RLS and grants applied. */
export async function as<T>(
  db: PGlite,
  uid: string | null,
  work: () => Promise<T>,
  role: "authenticated" | "anon" = "authenticated",
): Promise<T> {
  await db.query(`UPDATE public._ctx SET uid = $1::uuid`, [uid]);
  await db.exec(`SET ROLE ${role};`);
  try {
    return await work();
  } finally {
    await db.exec("RESET ROLE;");
  }
}

export async function rejected(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the database to reject this");
}
