import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BATCH_SIZE = 400;
const DELETE_CONCURRENCY = 5;
const MAX_CONTINUATIONS = 25;
const MAX_STALLED_ATTEMPTS = 3;
const MAX_REENTRY_ATTEMPTS = 3;
const AUTH_PAGE_SIZE = 1000;

const PRESERVED_REGISTERED_EMAILS = new Set([
  "mlmitchaman@gmail.com",
  "alastairigpark@gmail.com",
  "bobbungo2@gmail.com",
  "contact.mogzy.lol@gmail.com",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

type ServiceClient = ReturnType<typeof createClient>;

type Candidate = {
  userId: string;
  profileId?: string;
  displayName: string;
};

type PurgeState = {
  job_id: string;
  continuation: number;
  stalled_attempts: number;
  auth_deleted: number;
  orphan_profiles_removed: number;
  errors: string[];
};

type PurgeResult = PurgeState & {
  remaining_auth_users: number;
  remaining_profiles: number;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isMissingAuthUser = (error: { status?: number; message?: string } | null) =>
  error?.status === 404 || /user not found/i.test(error?.message ?? "");

const appendError = (errors: string[], message: string) => {
  if (errors.length < 200) errors.push(message);
};

async function deleteAnonymousProfilesForUser(
  serviceClient: ServiceClient,
  userId: string,
): Promise<{ removed: number; error?: string }> {
  const { error, count } = await serviceClient
    .from("profiles")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("is_anonymous", true);

  return error
    ? { removed: 0, error: error.message }
    : { removed: count ?? 0 };
}

async function getProfileBatch(serviceClient: ServiceClient): Promise<Candidate[]> {
  const { data, error } = await serviceClient
    .from("profiles")
    .select("id, user_id, display_name")
    .eq("is_anonymous", true)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw new Error(`anonymous profile fetch failed: ${error.message}`);
  return (data ?? []).map((profile) => ({
    userId: profile.user_id,
    profileId: profile.id,
    displayName: profile.display_name ?? profile.user_id,
  }));
}

async function getAnonymousAuthBatch(serviceClient: ServiceClient): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  for (let page = 1; candidates.length < BATCH_SIZE; page++) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw new Error(`anonymous auth fetch failed: ${error.message}`);

    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (user.is_anonymous === true && !(email && PRESERVED_REGISTERED_EMAILS.has(email))) {
        candidates.push({ userId: user.id, displayName: user.email ?? user.id });
        if (candidates.length === BATCH_SIZE) break;
      }
    }

    if (data.users.length < AUTH_PAGE_SIZE) break;
  }

  return candidates;
}

async function countAnonymousAuthUsers(serviceClient: ServiceClient): Promise<number> {
  let count = 0;

  for (let page = 1; ; page++) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw new Error(`anonymous auth count failed: ${error.message}`);
    count += data.users.filter((user) => user.is_anonymous === true).length;
    if (data.users.length < AUTH_PAGE_SIZE) return count;
  }
}

async function countAnonymousProfiles(serviceClient: ServiceClient): Promise<number> {
  const { error, count } = await serviceClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_anonymous", true);
  if (error) throw new Error(`anonymous profile count failed: ${error.message}`);
  return count ?? 0;
}

async function processCandidate(
  serviceClient: ServiceClient,
  candidate: Candidate,
): Promise<{ authDeleted: number; orphanProfilesRemoved: number; profilesRemoved: number; error?: string }> {
  try {
    // Verify the Auth record immediately before the irreversible delete.
    const { data: authData, error: authError } =
      await serviceClient.auth.admin.getUserById(candidate.userId);

    if (authError || !authData?.user) {
      if (candidate.profileId && (isMissingAuthUser(authError) || !authData?.user)) {
        const cleanup = await deleteAnonymousProfilesForUser(serviceClient, candidate.userId);
        return cleanup.error
          ? {
              authDeleted: 0,
              orphanProfilesRemoved: 0,
              profilesRemoved: 0,
              error: `${candidate.displayName} (${candidate.userId}): orphan profile cleanup failed: ${cleanup.error}`,
            }
          : {
              authDeleted: 0,
              orphanProfilesRemoved: cleanup.removed,
              profilesRemoved: 0,
            };
      }

      return {
        authDeleted: 0,
        orphanProfilesRemoved: 0,
        profilesRemoved: 0,
        error: `${candidate.displayName} (${candidate.userId}): auth verification failed: ${authError?.message ?? "user not found"}`,
      };
    }

    const email = authData.user.email?.toLowerCase();
    if (
      authData.user.is_anonymous !== true ||
      (email && PRESERVED_REGISTERED_EMAILS.has(email))
    ) {
      return {
        authDeleted: 0,
        orphanProfilesRemoved: 0,
        profilesRemoved: 0,
        error: `${candidate.displayName} (${candidate.userId}): blocked because the Auth user is registered or preserved`,
      };
    }

    // Auth Admin owns Auth side-table cleanup. Never delete auth.users via SQL.
    const { error: deleteError } =
      await serviceClient.auth.admin.deleteUser(candidate.userId);
    if (deleteError) {
      return {
        authDeleted: 0,
        orphanProfilesRemoved: 0,
        profilesRemoved: 0,
        error: `${candidate.displayName} (${candidate.userId}): ${deleteError.message}`,
      };
    }

    // The production FK did not remove the first 250 profiles, so clean the
    // anonymous profile explicitly after every successful Auth deletion.
    const cleanup = await deleteAnonymousProfilesForUser(serviceClient, candidate.userId);
    return {
      authDeleted: 1,
      orphanProfilesRemoved: 0,
      profilesRemoved: cleanup.removed,
      error: cleanup.error
        ? `${candidate.displayName} (${candidate.userId}): Auth deleted but profile cleanup failed: ${cleanup.error}`
        : undefined,
    };
  } catch (error) {
    return {
      authDeleted: 0,
      orphanProfilesRemoved: 0,
      profilesRemoved: 0,
      error: `${candidate.displayName} (${candidate.userId}): ${errorMessage(error)}`,
    };
  }
}

async function processBatch(
  serviceClient: ServiceClient,
  candidates: Candidate[],
  state: PurgeState,
): Promise<number> {
  let cursor = 0;
  let progress = 0;

  const worker = async () => {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      const result = await processCandidate(serviceClient, candidate);
      state.auth_deleted += result.authDeleted;
      state.orphan_profiles_removed += result.orphanProfilesRemoved;
      progress += result.authDeleted + result.orphanProfilesRemoved + result.profilesRemoved;
      if (result.error) appendError(state.errors, result.error);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(DELETE_CONCURRENCY, candidates.length) },
      () => worker(),
    ),
  );
  return progress;
}

async function invokeContinuation(
  supabaseUrl: string,
  serviceRoleKey: string,
  state: PurgeState,
): Promise<void> {
  const url = `${supabaseUrl}/functions/v1/purge-anonymous-users`;
  let lastError = "unknown continuation failure";

  for (let attempt = 1; attempt <= MAX_REENTRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(state),
      });
      if (response.ok) return;
      lastError = `HTTP ${response.status}: ${await response.text()}`;
    } catch (error) {
      lastError = errorMessage(error);
    }
  }

  console.error(`[${state.job_id}] purge continuation failed after retries: ${lastError}`);
}

async function runPurge(
  serviceClient: ServiceClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  state: PurgeState,
): Promise<Response> {
  const profileCandidates = await getProfileBatch(serviceClient);
  const candidates = profileCandidates.length > 0
    ? profileCandidates
    : await getAnonymousAuthBatch(serviceClient);

  const progress = await processBatch(serviceClient, candidates, state);
  state.stalled_attempts = progress > 0 ? 0 : state.stalled_attempts + 1;

  const [remainingAuthUsers, remainingProfiles] = await Promise.all([
    countAnonymousAuthUsers(serviceClient),
    countAnonymousProfiles(serviceClient),
  ]);

  const result: PurgeResult = {
    ...state,
    remaining_auth_users: remainingAuthUsers,
    remaining_profiles: remainingProfiles,
  };

  if (remainingAuthUsers === 0 && remainingProfiles === 0) {
    console.log(`[${state.job_id}] anonymous purge complete`, result);
    return json({ message: "Anonymous purge complete", ...result });
  }

  if (state.continuation >= MAX_CONTINUATIONS) {
    appendError(state.errors, "automatic continuation limit reached");
    return json({ message: "Anonymous purge stopped before completion", ...result }, 500);
  }

  if (state.stalled_attempts >= MAX_STALLED_ATTEMPTS) {
    appendError(state.errors, "purge made no progress after three automatic retries");
    return json({ message: "Anonymous purge stalled", ...result }, 500);
  }

  const nextState: PurgeState = {
    ...state,
    continuation: state.continuation + 1,
  };
  EdgeRuntime.waitUntil(invokeContinuation(supabaseUrl, serviceRoleKey, nextState));

  return json({
    message: "Anonymous purge is continuing automatically; do not click purge again",
    ...result,
  }, 202);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Required Supabase environment is missing" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.slice("Bearer ".length);
    const isInternalContinuation = token === serviceRoleKey;
    let state: PurgeState;

    if (isInternalContinuation) {
      const body = await req.json().catch(() => null) as Partial<PurgeState> | null;
      if (!body?.job_id || typeof body.continuation !== "number") {
        return json({ error: "Invalid continuation payload" }, 400);
      }
      state = {
        job_id: body.job_id,
        continuation: body.continuation,
        stalled_attempts: body.stalled_attempts ?? 0,
        auth_deleted: body.auth_deleted ?? 0,
        orphan_profiles_removed: body.orphan_profiles_removed ?? 0,
        errors: Array.isArray(body.errors) ? body.errors.slice(0, 200) : [],
      };
    } else {
      // Only the exact service-role secret may bypass the owner-facing admin
      // gate, and only to carry the automatic continuation state.
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } =
        await anonClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

      const userId = claimsData.claims.sub as string;
      const { data: roleData, error: roleError } = await anonClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (roleError) return json({ error: "Unable to verify admin access" }, 500);

      const roles = (roleData ?? []).map((row: { role: string }) => row.role);
      if (!roles.includes("admin") && !roles.includes("master_admin")) {
        return json({ error: "Admin access required" }, 403);
      }

      state = {
        job_id: crypto.randomUUID(),
        continuation: 0,
        stalled_attempts: 0,
        auth_deleted: 0,
        orphan_profiles_removed: 0,
        errors: [],
      };
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return await runPurge(serviceClient, supabaseUrl, serviceRoleKey, state);
  } catch (error) {
    console.error("purge-anonymous-users failed", error);
    return json({ error: "Internal error", detail: errorMessage(error) }, 500);
  }
});
