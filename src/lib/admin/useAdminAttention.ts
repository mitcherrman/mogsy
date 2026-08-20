// ---------------------------------------------------------------------------
// useAdminAttention — the cross-domain attention queue behind Overview.
//
// A VIEW over review systems that already exist. It creates no new approval
// semantics, no new queue and no new table: each entry is a count of an
// existing queue plus a deep link into that queue's canonical domain page.
//
// Every count is read with the SAME client and the SAME policies the domain
// page already uses, so a viewer never sees a number they could not open. Each
// count fails independently: one unavailable source shows "unavailable" beside
// its own row rather than blanking the surface. No metric is invented — a
// source with no existing reader is simply absent.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AttentionEntry {
  id: string;
  label: string;
  /** Where the operator goes to act on it — always an existing canonical page. */
  to: string;
  /** null while loading, number when known, "error" when the source failed. */
  count: number | null | "error";
  hint: string;
}

const SOURCES: Array<{
  id: string;
  label: string;
  to: string;
  hint: string;
  load: () => Promise<number>;
}> = [
  {
    id: "admin-notifications",
    label: "Unread admin notifications",
    to: "/admin/people?section=notifications",
    hint: "Feedback arrivals, user reports and moderator delete requests.",
    load: async () => {
      const { count, error } = await supabase
        .from("admin_notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    id: "user-reports",
    label: "Pending user reports",
    to: "/admin/people?section=moderation",
    hint: "The user_reports queue.",
    load: async () => {
      const { count, error } = await supabase
        .from("user_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    id: "comment-reports",
    label: "Comment reports",
    to: "/admin/people?section=moderation",
    hint: "The comment_reports queue — a separate table from user reports.",
    load: async () => {
      const { count, error } = await supabase
        .from("comment_reports")
        .select("comment_id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    id: "feedback",
    label: "Open feedback",
    to: "/admin/people?section=feedback",
    hint: "Unarchived feedback, read through admin_list_feedback.",
    load: async () => {
      const { data, error } = await supabase.rpc("admin_list_feedback", {
        _show_archived: false,
      });
      if (error) throw error;
      return Array.isArray(data) ? data.length : 0;
    },
  },
];

export function useAdminAttention(): AttentionEntry[] {
  const [entries, setEntries] = useState<AttentionEntry[]>(() =>
    SOURCES.map((s) => ({ id: s.id, label: s.label, to: s.to, hint: s.hint, count: null })),
  );

  useEffect(() => {
    let cancelled = false;
    for (const source of SOURCES) {
      void source
        .load()
        .then((count) => {
          if (cancelled) return;
          setEntries((prev) =>
            prev.map((e) => (e.id === source.id ? { ...e, count } : e)),
          );
        })
        .catch(() => {
          if (cancelled) return;
          setEntries((prev) =>
            prev.map((e) => (e.id === source.id ? { ...e, count: "error" as const } : e)),
          );
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return entries;
}
