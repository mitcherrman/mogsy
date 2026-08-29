/**
 * REAL captured backend payloads from the generated Mastery playtest prototypes.
 *
 * Not hand-authored. Recorded verbatim from the reconciled backend running with
 * `MASTERY_GENERATED_PLAYTEST=1` against the canonical `lol_calc.db`, by
 * walking the exact dev HTTP flow the launcher uses:
 *
 *   GET  /api/mastery/dev/generated-playtest-sets
 *   POST /api/mastery/dev/generated-playtest-session
 *   GET  /api/mastery/sessions/{id}/current
 *   POST /api/mastery/sessions/{id}/answer
 *   POST /api/mastery/sessions/{id}/advance
 *
 * Hand-written fixtures are what let Phase 4C1/4C2 pass 252 tests while the
 * first real playtest failed to render the matchup set at all: the fixture
 * carried a `focus` field the real adapter did not emit. These payloads cannot
 * drift from the backend in that direction, because they came from it.
 *
 * REGENERATED during the Phase 1 reconciliation onto origin/master, so the
 * digests and session ids below are the reconciled backend's, not the
 * pre-reconciliation branch's.
 *
 * Regenerate with the steps documented in docs/mastery-redesign-handoff.md.
 */

export interface CapturedStep {
  readonly question: Record<string, unknown>;
  readonly reveal: Record<string, unknown>;
}

export interface CapturedRun {
  readonly session: Record<string, unknown>;
  readonly steps: readonly CapturedStep[];
}

export const CAPTURED_CHAMPION_RUN: CapturedRun =
{
  "session": {
    "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
    "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
    "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
    "display_revision": "disprev_generated-ahri-champion.playtest.v1",
    "current_sequence_index": 0,
    "total_steps": 15,
    "phase": "question",
    "completed": false
  },
  "steps": [
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 0,
        "total_steps": 15,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri Q \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "9",
          "7",
          "11",
          "4"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_flat",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "Q",
          "ability_name": "Q",
          "context": {
            "ability_rank": null,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 0,
        "question_family": "ability_cooldown",
        "player_answer": "7",
        "authoritative_correctness": true,
        "correct_answer": "7",
        "correct_answer_display": "7",
        "exact_correct_answer": "7",
        "explanation": "Ahri Q: 7 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 3
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 1,
        "total_steps": 15,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri E \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "12",
          "10",
          "15",
          "18"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_flat",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "E",
          "ability_name": "E",
          "context": {
            "ability_rank": null,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 1,
        "question_family": "ability_cooldown",
        "player_answer": "12",
        "authoritative_correctness": true,
        "correct_answer": "12",
        "correct_answer_display": "12",
        "exact_correct_answer": "12",
        "explanation": "Ahri E: 12 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 3
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 2,
        "total_steps": 15,
        "question_family": "ability_cost",
        "answer_type": "single_choice",
        "prompt": "Ahri Q \u2014 ability_cost",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "40",
          "75",
          "55",
          "65"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cost_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cost",
          "subject_ref": "Q",
          "ability_name": "Q",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 2,
        "question_family": "ability_cost",
        "player_answer": "55",
        "authoritative_correctness": true,
        "correct_answer": "55",
        "correct_answer_display": "55",
        "exact_correct_answer": "55",
        "explanation": "Ahri Q: 55 mana.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 1
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 3,
        "total_steps": 15,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri W \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "12",
          "9",
          "6",
          "5"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "W",
          "ability_name": "W",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 3,
        "question_family": "ability_cooldown",
        "player_answer": "9",
        "authoritative_correctness": true,
        "correct_answer": "9",
        "correct_answer_display": "9",
        "exact_correct_answer": "9",
        "explanation": "Ahri W: 9 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 2
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 4,
        "total_steps": 15,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri R \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "120",
          "140",
          "180",
          "130"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "R",
          "ability_name": "R",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 4,
        "question_family": "ability_cooldown",
        "player_answer": "140",
        "authoritative_correctness": true,
        "correct_answer": "140",
        "correct_answer_display": "140",
        "exact_correct_answer": "140",
        "explanation": "Ahri R: 140 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 3
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 5,
        "total_steps": 15,
        "question_family": "ability_cost",
        "answer_type": "single_choice",
        "prompt": "Ahri Q \u2014 ability_cost",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "95",
          "105",
          "90",
          "75"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cost_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cost",
          "subject_ref": "Q",
          "ability_name": "Q",
          "context": {
            "ability_rank": 3,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 5,
        "question_family": "ability_cost",
        "player_answer": "75",
        "authoritative_correctness": true,
        "correct_answer": "75",
        "correct_answer_display": "75",
        "exact_correct_answer": "75",
        "explanation": "Ahri Q: 75 mana.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 1
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 6,
        "total_steps": 15,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri W \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "5",
          "7",
          "12",
          "9"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "W",
          "ability_name": "W",
          "context": {
            "ability_rank": 3,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 6,
        "question_family": "ability_cooldown",
        "player_answer": "7",
        "authoritative_correctness": true,
        "correct_answer": "7",
        "correct_answer_display": "7",
        "exact_correct_answer": "7",
        "explanation": "Ahri W: 7 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 2
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 7,
        "total_steps": 15,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri R \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "120",
          "160",
          "110",
          "100"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "R",
          "ability_name": "R",
          "context": {
            "ability_rank": 2,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 7,
        "question_family": "ability_cooldown",
        "player_answer": "120",
        "authoritative_correctness": true,
        "correct_answer": "120",
        "correct_answer_display": "120",
        "exact_correct_answer": "120",
        "explanation": "Ahri R: 120 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 3
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 8,
        "total_steps": 15,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri W \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "6",
          "8",
          "5",
          "3"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "W",
          "ability_name": "W",
          "context": {
            "ability_rank": 5,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 8,
        "question_family": "ability_cooldown",
        "player_answer": "5",
        "authoritative_correctness": true,
        "correct_answer": "5",
        "correct_answer_display": "5",
        "exact_correct_answer": "5",
        "explanation": "Ahri W: 5 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 2
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 9,
        "total_steps": 15,
        "question_family": "ability_cost",
        "answer_type": "single_choice",
        "prompt": "Ahri Q \u2014 ability_cost",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "95",
          "115",
          "85",
          "75"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cost_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cost",
          "subject_ref": "Q",
          "ability_name": "Q",
          "context": {
            "ability_rank": 5,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 9,
        "question_family": "ability_cost",
        "player_answer": "95",
        "authoritative_correctness": true,
        "correct_answer": "95",
        "correct_answer_display": "95",
        "exact_correct_answer": "95",
        "explanation": "Ahri Q: 95 mana.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 1
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 10,
        "total_steps": 15,
        "question_family": "champion_level_stat",
        "answer_type": "single_choice",
        "prompt": "Ahri \u2014 base_health",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "1483",
          "1523",
          "1513",
          "1503"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "champion_stat_at_level",
          "champion_display": "Ahri",
          "metric": "base_health",
          "subject_ref": "",
          "ability_name": "",
          "context": {
            "ability_rank": null,
            "champion_level": 11,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 10,
        "question_family": "champion_level_stat",
        "player_answer": "1503",
        "authoritative_correctness": true,
        "correct_answer": "1503",
        "correct_answer_display": "1503",
        "exact_correct_answer": "1503",
        "explanation": "Ahri: 1502.6 hitpoints, which rounds to 1503 for this question.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 1
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 11,
        "total_steps": 15,
        "question_family": "champion_level_stat",
        "answer_type": "single_choice",
        "prompt": "Ahri \u2014 base_armor",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "43",
          "58",
          "73",
          "68"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "champion_stat_at_level",
          "champion_display": "Ahri",
          "metric": "base_armor",
          "subject_ref": "",
          "ability_name": "",
          "context": {
            "ability_rank": null,
            "champion_level": 11,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 11,
        "question_family": "champion_level_stat",
        "player_answer": "58",
        "authoritative_correctness": true,
        "correct_answer": "58",
        "correct_answer_display": "58",
        "exact_correct_answer": "58",
        "explanation": "Ahri: 57.855 armor, which rounds to 58 for this question.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 1
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 12,
        "total_steps": 15,
        "question_family": "champion_level_stat",
        "answer_type": "single_choice",
        "prompt": "Ahri \u2014 base_attack_damage",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "84",
          "114",
          "104",
          "144"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "champion_stat_at_level",
          "champion_display": "Ahri",
          "metric": "base_attack_damage",
          "subject_ref": "",
          "ability_name": "",
          "context": {
            "ability_rank": null,
            "champion_level": 18,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 12,
        "question_family": "champion_level_stat",
        "player_answer": "104",
        "authoritative_correctness": true,
        "correct_answer": "104",
        "correct_answer_display": "104",
        "exact_correct_answer": "104",
        "explanation": "Ahri: 104 attack_damage.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 1
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 13,
        "total_steps": 15,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri Q \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "9",
          "7",
          "11",
          "4"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_flat",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "Q",
          "ability_name": "Q",
          "context": {
            "ability_rank": null,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 13,
        "question_family": "ability_cooldown",
        "player_answer": "7",
        "authoritative_correctness": true,
        "correct_answer": "7",
        "correct_answer_display": "7",
        "exact_correct_answer": "7",
        "explanation": "Ahri Q: 7 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 3
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 14,
        "total_steps": 15,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri E \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": null,
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "12",
          "10",
          "15",
          "18"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_flat",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "E",
          "ability_name": "E",
          "context": {
            "ability_rank": null,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_1746b0c46ea14c52bf3b980a4be4e015",
        "mastery_set_id": "mset_e52652f55c82ffc51e3b9696d5331d8a5b40be24752e564d6476cd860118c889",
        "artifact_digest": "martifact_8688e10c7d57d96a2513d1298213e55c7cb640b13ff0c9d3b74ba43989dafb5e",
        "display_revision": "disprev_generated-ahri-champion.playtest.v1",
        "sequence_index": 14,
        "question_family": "ability_cooldown",
        "player_answer": "12",
        "authoritative_correctness": true,
        "correct_answer": "12",
        "correct_answer_display": "12",
        "exact_correct_answer": "12",
        "explanation": "Ahri E: 12 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 3
        },
        "next_step_ready": false,
        "completion_state": {
          "is_final_step": true,
          "set_completed": false
        }
      }
    }
  ]
} as unknown as CapturedRun;

export const CAPTURED_MATCHUP_RUN: CapturedRun =
{
  "session": {
    "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
    "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
    "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
    "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
    "current_sequence_index": 0,
    "total_steps": 13,
    "phase": "question",
    "completed": false
  },
  "steps": [
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 0,
        "total_steps": 13,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Syndra W \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "10",
          "15",
          "12",
          "9"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_at_rank",
          "champion_display": "Syndra",
          "metric": "ability_cooldown",
          "subject_ref": "W",
          "ability_name": "W",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 0,
        "question_family": "ability_cooldown",
        "player_answer": "12",
        "authoritative_correctness": true,
        "correct_answer": "12",
        "correct_answer_display": "12",
        "exact_correct_answer": "12",
        "explanation": "Syndra W: 12 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 3
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 1,
        "total_steps": 13,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri W \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "12",
          "9",
          "6",
          "5"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "W",
          "ability_name": "W",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 1,
        "question_family": "ability_cooldown",
        "player_answer": "9",
        "authoritative_correctness": true,
        "correct_answer": "9",
        "correct_answer_display": "9",
        "exact_correct_answer": "9",
        "explanation": "Ahri W: 9 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 2
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 2,
        "total_steps": 13,
        "question_family": "ability_cost",
        "answer_type": "single_choice",
        "prompt": "Syndra Q \u2014 ability_cost",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "40",
          "45",
          "30",
          "60"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cost_at_rank",
          "champion_display": "Syndra",
          "metric": "ability_cost",
          "subject_ref": "Q",
          "ability_name": "Q",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 2,
        "question_family": "ability_cost",
        "player_answer": "40",
        "authoritative_correctness": true,
        "correct_answer": "40",
        "correct_answer_display": "40",
        "exact_correct_answer": "40",
        "explanation": "Syndra Q: 40 mana.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 1
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 3,
        "total_steps": 13,
        "question_family": "ability_cost",
        "answer_type": "single_choice",
        "prompt": "Ahri Q \u2014 ability_cost",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "40",
          "75",
          "55",
          "65"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cost_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cost",
          "subject_ref": "Q",
          "ability_name": "Q",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 3,
        "question_family": "ability_cost",
        "player_answer": "55",
        "authoritative_correctness": true,
        "correct_answer": "55",
        "correct_answer_display": "55",
        "exact_correct_answer": "55",
        "explanation": "Ahri Q: 55 mana.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 1
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 4,
        "total_steps": 13,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri W vs Syndra W \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "ahri",
          "syndra",
          "tie"
        ],
        "input_constraints": null,
        "interaction_kind": "comparison_left_right",
        "prompt_semantics": null,
        "comparison_semantics": {
          "template": "compare_ability_cooldown",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra",
          "metric": "ability_cooldown",
          "dimension": "duration",
          "subject_ref": "W",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          },
          "unit": "seconds"
        }
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 4,
        "question_family": "ability_cooldown",
        "player_answer": "ahri",
        "authoritative_correctness": true,
        "correct_answer": "ahri",
        "correct_answer_display": "ahri",
        "exact_correct_answer": "ahri",
        "explanation": "Ahri W: 9 seconds. Syndra W: 12 seconds. Ahri wins by 3 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 5
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 5,
        "total_steps": 13,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri R vs Syndra R \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "ahri",
          "syndra",
          "tie"
        ],
        "input_constraints": null,
        "interaction_kind": "comparison_left_right",
        "prompt_semantics": null,
        "comparison_semantics": {
          "template": "compare_ability_cooldown",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra",
          "metric": "ability_cooldown",
          "dimension": "duration",
          "subject_ref": "R",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          },
          "unit": "seconds"
        }
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 5,
        "question_family": "ability_cooldown",
        "player_answer": "syndra",
        "authoritative_correctness": true,
        "correct_answer": "syndra",
        "correct_answer_display": "syndra",
        "exact_correct_answer": "syndra",
        "explanation": "Ahri R: 140 seconds. Syndra R: 120 seconds. Syndra wins by 20 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 6
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 6,
        "total_steps": 13,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri W vs Syndra W \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "ahri",
          "syndra",
          "tie"
        ],
        "input_constraints": null,
        "interaction_kind": "comparison_left_right",
        "prompt_semantics": null,
        "comparison_semantics": {
          "template": "compare_ability_cooldown",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra",
          "metric": "ability_cooldown",
          "dimension": "duration",
          "subject_ref": "W",
          "context": {
            "ability_rank": 5,
            "champion_level": null,
            "form": null
          },
          "unit": "seconds"
        }
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 6,
        "question_family": "ability_cooldown",
        "player_answer": "ahri",
        "authoritative_correctness": true,
        "correct_answer": "ahri",
        "correct_answer_display": "ahri",
        "exact_correct_answer": "ahri",
        "explanation": "Ahri W: 5 seconds. Syndra W: 8 seconds. Ahri wins by 3 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 5
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 7,
        "total_steps": 13,
        "question_family": "champion_base_stat",
        "answer_type": "single_choice",
        "prompt": "Ahri vs Syndra \u2014 base_health",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "ahri",
          "syndra",
          "tie"
        ],
        "input_constraints": null,
        "interaction_kind": "comparison_left_right",
        "prompt_semantics": null,
        "comparison_semantics": {
          "template": "compare_champion_base_stat",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra",
          "metric": "base_health",
          "dimension": "health",
          "subject_ref": "",
          "context": {
            "ability_rank": null,
            "champion_level": null,
            "form": null
          },
          "unit": "hitpoints"
        }
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 7,
        "question_family": "champion_base_stat",
        "player_answer": "ahri",
        "authoritative_correctness": true,
        "correct_answer": "ahri",
        "correct_answer_display": "ahri",
        "exact_correct_answer": "ahri",
        "explanation": "Ahri: 590 hitpoints. Syndra: 583 hitpoints. Ahri wins by 7 hitpoints.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 2
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 8,
        "total_steps": 13,
        "question_family": "champion_base_stat",
        "answer_type": "single_choice",
        "prompt": "Ahri vs Syndra \u2014 base_armor",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "ahri",
          "syndra",
          "tie"
        ],
        "input_constraints": null,
        "interaction_kind": "comparison_left_right",
        "prompt_semantics": null,
        "comparison_semantics": {
          "template": "compare_champion_base_stat",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra",
          "metric": "base_armor",
          "dimension": "armor",
          "subject_ref": "",
          "context": {
            "ability_rank": null,
            "champion_level": null,
            "form": null
          },
          "unit": "armor"
        }
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 8,
        "question_family": "champion_base_stat",
        "player_answer": "syndra",
        "authoritative_correctness": true,
        "correct_answer": "syndra",
        "correct_answer_display": "syndra",
        "exact_correct_answer": "syndra",
        "explanation": "Ahri: 21 armor. Syndra: 25 armor. Syndra wins by 4 armor.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 2
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 9,
        "total_steps": 13,
        "question_family": "champion_base_stat",
        "answer_type": "single_choice",
        "prompt": "Ahri vs Syndra \u2014 base_attack_damage",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "ahri",
          "syndra",
          "tie"
        ],
        "input_constraints": null,
        "interaction_kind": "comparison_left_right",
        "prompt_semantics": null,
        "comparison_semantics": {
          "template": "compare_champion_base_stat",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra",
          "metric": "base_attack_damage",
          "dimension": "attack_damage",
          "subject_ref": "",
          "context": {
            "ability_rank": null,
            "champion_level": null,
            "form": null
          },
          "unit": "attack_damage"
        }
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 9,
        "question_family": "champion_base_stat",
        "player_answer": "syndra",
        "authoritative_correctness": true,
        "correct_answer": "syndra",
        "correct_answer_display": "syndra",
        "exact_correct_answer": "syndra",
        "explanation": "Ahri: 53 attack_damage. Syndra: 54 attack_damage. Syndra wins by 1 attack_damage.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 2
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 10,
        "total_steps": 13,
        "question_family": "champion_base_stat",
        "answer_type": "single_choice",
        "prompt": "Ahri vs Syndra \u2014 attack_range",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "ahri",
          "syndra",
          "tie"
        ],
        "input_constraints": null,
        "interaction_kind": "comparison_left_right",
        "prompt_semantics": null,
        "comparison_semantics": {
          "template": "compare_champion_base_stat",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra",
          "metric": "attack_range",
          "dimension": "distance",
          "subject_ref": "",
          "context": {
            "ability_rank": null,
            "champion_level": null,
            "form": null
          },
          "unit": "units"
        }
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 10,
        "question_family": "champion_base_stat",
        "player_answer": "tie",
        "authoritative_correctness": true,
        "correct_answer": "tie",
        "correct_answer_display": "tie",
        "exact_correct_answer": "tie",
        "explanation": "Ahri: 550 units. Syndra: 550 units. Tie.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 2
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 11,
        "total_steps": 13,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Syndra W \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "10",
          "15",
          "12",
          "9"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_at_rank",
          "champion_display": "Syndra",
          "metric": "ability_cooldown",
          "subject_ref": "W",
          "ability_name": "W",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 11,
        "question_family": "ability_cooldown",
        "player_answer": "12",
        "authoritative_correctness": true,
        "correct_answer": "12",
        "correct_answer_display": "12",
        "exact_correct_answer": "12",
        "explanation": "Syndra W: 12 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 3
        },
        "next_step_ready": true,
        "completion_state": {
          "is_final_step": false,
          "set_completed": false
        }
      }
    },
    {
      "question": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 12,
        "total_steps": 13,
        "question_family": "ability_cooldown",
        "answer_type": "single_choice",
        "prompt": "Ahri W \u2014 ability_cooldown",
        "state": null,
        "patch_display": "",
        "matchup_identity": {
          "champion_a": "Ahri",
          "champion_b": "Syndra",
          "focus": "",
          "champion_a_display": "Ahri",
          "champion_b_display": "Syndra"
        },
        "is_read_only": true,
        "hint_available": false,
        "answer_options": [
          "12",
          "9",
          "6",
          "5"
        ],
        "input_constraints": null,
        "interaction_kind": "atomic_recall",
        "prompt_semantics": {
          "template": "ability_cooldown_at_rank",
          "champion_display": "Ahri",
          "metric": "ability_cooldown",
          "subject_ref": "W",
          "ability_name": "W",
          "context": {
            "ability_rank": 1,
            "champion_level": null,
            "form": null
          }
        },
        "comparison_semantics": null
      },
      "reveal": {
        "session_id": "msess_57531bc1fccd4da5b370b4d9668929d6",
        "mastery_set_id": "mset_1213cf5ab7100acf734dd43bff6dcfaa3ce465a0a2ff75c9ec95ada3ebfdf4ff",
        "artifact_digest": "martifact_672f6f91cbe35119bd26bd70e37478d4d88c969a8b2744705245fe0c3fae8d6a",
        "display_revision": "disprev_generated-ahri-syndra-matchup.playtest.v1",
        "sequence_index": 12,
        "question_family": "ability_cooldown",
        "player_answer": "9",
        "authoritative_correctness": true,
        "correct_answer": "9",
        "correct_answer_display": "9",
        "exact_correct_answer": "9",
        "explanation": "Ahri W: 9 seconds.",
        "calculation_steps": [],
        "before_state": null,
        "after_state": null,
        "applied_transition": null,
        "proposed_transition": null,
        "source_summary": {
          "label": "canonical Mogzy champion data",
          "source_count": 2
        },
        "next_step_ready": false,
        "completion_state": {
          "is_final_step": true,
          "set_completed": false
        }
      }
    }
  ]
} as unknown as CapturedRun;
