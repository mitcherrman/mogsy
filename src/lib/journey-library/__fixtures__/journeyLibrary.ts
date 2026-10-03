/**
 * JLIB-FE — `GET /api/journeys` as the JLIB-API backend (local SHA 1256ff7c)
 * answered it against the canonical content DB: the 14 Daily-servable
 * recipes at v1, every one available. Captured from
 * `content_sets.journey_library.public_library_entry`, not hand-written.
 */

export type RawJourneyEntry = Record<string, unknown>;

export const CAPTURED_JOURNEYS: RawJourneyEntry[] = [
  {"recipe_id": "bot.ashe_vs_jinx", "recipe_version": 1, "source": "daily", "title": "Ashe vs Jinx", "role": "bot", "champions": [{"id": "ashe", "label": "Ashe"}, {"id": "jinx", "label": "Jinx"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "bot.lucian_vs_caitlyn", "recipe_version": 1, "source": "daily", "title": "Lucian vs Caitlyn", "role": "bot", "champions": [{"id": "lucian", "label": "Lucian"}, {"id": "caitlyn", "label": "Caitlyn"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "jungle.nocturne_vs_vi", "recipe_version": 1, "source": "daily", "title": "Nocturne vs Vi", "role": "jungle", "champions": [{"id": "nocturne", "label": "Nocturne"}, {"id": "vi", "label": "Vi"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "jungle.olaf_vs_jarvan", "recipe_version": 1, "source": "daily", "title": "Olaf vs Jarvan IV", "role": "jungle", "champions": [{"id": "olaf", "label": "Olaf"}, {"id": "jarvan", "label": "Jarvan IV"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "jungle.volibear_vs_leesin", "recipe_version": 1, "source": "daily", "title": "Volibear vs Lee Sin", "role": "jungle", "champions": [{"id": "volibear", "label": "Volibear"}, {"id": "lee sin", "label": "Lee Sin"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "mid.ahri_vs_syndra", "recipe_version": 1, "source": "daily", "title": "Ahri vs Syndra", "role": "mid", "champions": [{"id": "ahri", "label": "Ahri"}, {"id": "syndra", "label": "Syndra"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "mid.akshan_vs_syndra", "recipe_version": 1, "source": "daily", "title": "Akshan vs Syndra", "role": "mid", "champions": [{"id": "akshan", "label": "Akshan"}, {"id": "syndra", "label": "Syndra"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "mid.pantheon_vs_ahri", "recipe_version": 1, "source": "daily", "title": "Pantheon vs Ahri", "role": "mid", "champions": [{"id": "pantheon", "label": "Pantheon"}, {"id": "ahri", "label": "Ahri"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "mid.zed_vs_ahri", "recipe_version": 1, "source": "daily", "title": "Zed vs Ahri", "role": "mid", "champions": [{"id": "zed", "label": "Zed"}, {"id": "ahri", "label": "Ahri"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "support.ashe_vs_nautilus", "recipe_version": 1, "source": "daily", "title": "Ashe vs Nautilus", "role": "support", "champions": [{"id": "ashe", "label": "Ashe"}, {"id": "nautilus", "label": "Nautilus"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "support.pantheon_vs_leona", "recipe_version": 1, "source": "daily", "title": "Pantheon vs Leona", "role": "support", "champions": [{"id": "pantheon", "label": "Pantheon"}, {"id": "leona", "label": "Leona"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "top.olaf_vs_sett", "recipe_version": 1, "source": "daily", "title": "Olaf vs Sett", "role": "top", "champions": [{"id": "olaf", "label": "Olaf"}, {"id": "sett", "label": "Sett"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "top.tryndamere_vs_darius", "recipe_version": 1, "source": "daily", "title": "Tryndamere vs Darius", "role": "top", "champions": [{"id": "tryndamere", "label": "Tryndamere"}, {"id": "darius", "label": "Darius"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
  {"recipe_id": "top.volibear_vs_renekton", "recipe_version": 1, "source": "daily", "title": "Volibear vs Renekton", "role": "top", "champions": [{"id": "volibear", "label": "Volibear"}, {"id": "renekton", "label": "Renekton"}], "plan": "standard", "questions": 5, "status": "active", "available": true, "unavailable_code": null, "superseded": []},
];

/** The list envelope, optionally with entries changed per recipe id. */
export function journeyLibraryList(
  patch: Record<string, Partial<RawJourneyEntry>> = {},
  journeys: RawJourneyEntry[] = CAPTURED_JOURNEYS,
) {
  return {
    schema_version: "journey_library_list.v1",
    server_time: "2026-10-03T12:00:00+00:00",
    journeys: journeys.map((j) => ({ ...j, ...(patch[j.recipe_id as string] ?? {}) })),
  };
}

/** The launch's `matched` queue envelope (the same shape as POST /api/ranked/queue). */
export function journeyLaunchMatched(matchId = "rkb_journey01", recipeId = "mid.zed_vs_ahri", recipeVersion = 1) {
  return {
    schema_version: "ranked_duel.queue_status.v1",
    projection_type: "queue_status",
    server_time: "2026-10-03T12:00:00+00:00",
    match_id: matchId,
    round_number: null,
    payload: {
      status: "matched", match_id: matchId, queue_version: 1,
      class_id: "tank", role: "mid", enqueued_at: "2026-10-03T12:00:00+00:00",
    },
    journey: { recipe_id: recipeId, recipe_version: recipeVersion, title: "Zed vs Ahri" },
  };
}
