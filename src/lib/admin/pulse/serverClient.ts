// PULSE-2B — the server repository bound to the app's Supabase client.
// Kept apart from supabaseRepository.ts so tests never load the real client.
import { supabase } from "@/integrations/supabase/client";

import type { PulseAdminRepository } from "./repository";
import { createSupabasePulseRepository, type PulseRpc } from "./supabaseRepository";

// The pulse_admin_* RPCs are not in the generated types until the staged
// migration is applied (same `as never` pattern as admin-users.ts).
const rpc: PulseRpc = (fn, args) => supabase.rpc(fn as never, args as never) as unknown as ReturnType<PulseRpc>;

export function createServerPulseRepository(): PulseAdminRepository {
  return createSupabasePulseRepository({ rpc });
}
