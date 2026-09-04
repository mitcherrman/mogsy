/**
 * REAL payloads, one per shape the presentation contract can emit.
 *
 * Frozen fixtures rather than hand-written ones on purpose: a hand-written
 * card proves the component renders what the test author imagined, and these
 * prove it renders what the server actually sends — including the awkward
 * real cases (a FLEX role, a multi-team career, an unshortened league name,
 * a scope anchor with no art, and two lineages of the same org side by side).
 *
 * `nuguri_clear` and `t1_lineage` are generated against the live authority
 * through the same builders the API uses; the rest were captured from
 * `/api/pro-play/quiz/*` in production on 2026-09-04. Do not edit by hand.
 */
import type { ProPlayAnswerResult, ProPlayQuestion } from "@/lib/pro-play/api";

export type ProPlaySample = { question: ProPlayQuestion; result: ProPlayAnswerResult };

export const PRO_PLAY_SAMPLES = {
  "champion_player": {
    "question": {
      "index": 3,
      "number": 4,
      "total": 10,
      "topic": "Player",
      "question_id": "a41f5173790f44eb",
      "question_text": "In LPL, who has the higher win rate on Udyr: Weiwei or H4cker?",
      "choices": [
        "H4cker",
        "Weiwei"
      ],
      "presentation": {
        "shape": "champion_pairwise",
        "player_display": null,
        "candidates": [
          "H4cker",
          "Weiwei"
        ],
        "champion_key": "Udyr",
        "metric": "win_rate",
        "scope_label": "Udyr in LPL"
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "champion_player",
          "label": "Champion → Player",
          "anchor_entity": "champion",
          "subject_entity": "player"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "Tencent LoL Pro League",
            "type": "league",
            "label": "LPL",
            "tooltip": "Tencent LoL Pro League",
            "priority": 10
          },
          {
            "id": "all_time",
            "type": "all_time",
            "label": "ALL TIME",
            "tooltip": "Every season available in this scope",
            "priority": 90
          }
        ],
        "metric": {
          "id": "win_rate",
          "label": "WIN RATE",
          "kind": "rate",
          "tooltip": "Share of games won in this scope"
        },
        "anchor": {
          "kind": "champion",
          "label": "Udyr",
          "id": "Udyr",
          "media": {
            "kind": "champion",
            "key": "Udyr"
          },
          "tooltip": "Udyr"
        },
        "subjects": [
          {
            "kind": "player",
            "label": "H4cker",
            "id": "623cfcce9d2deeae",
            "role": {
              "id": "jungle",
              "label": "JUNGLE",
              "tooltip": "Jungle"
            },
            "seasons": {
              "first": 2017,
              "last": 2024,
              "label": "2017–2024",
              "tooltip": "Seasons in this scope"
            },
            "teams": [
              {
                "id": "8798e53ee8333b5f",
                "label": "Ultra Prime",
                "short": "UP",
                "region": "China",
                "seasons": {
                  "first": 2021,
                  "last": 2024,
                  "label": "2021–2024",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Ultra Prime"
              },
              {
                "id": "1b0bd5200fb917cb",
                "label": "FunPlus Phoenix",
                "short": "FPX",
                "region": "China",
                "seasons": {
                  "first": 2023,
                  "last": 2023,
                  "label": "2023",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "FunPlus Phoenix"
              },
              {
                "id": "925c5ca842da683e",
                "label": "eStar",
                "short": "ES",
                "region": "China",
                "seasons": {
                  "first": 2021,
                  "last": 2021,
                  "label": "2021",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "eStar"
              },
              {
                "id": "d93f7fa433dd64d7",
                "label": "Oh My God",
                "short": "OMG",
                "region": "China",
                "seasons": {
                  "first": 2020,
                  "last": 2020,
                  "label": "2020",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Oh My God"
              }
            ],
            "teams_total": 5,
            "teams_shown": 4,
            "media": {
              "kind": "player",
              "key": null
            },
            "tooltip": "H4cker"
          },
          {
            "kind": "player",
            "label": "Weiwei",
            "id": "f687633b4592f010",
            "role": {
              "id": "jungle",
              "label": "JUNGLE",
              "tooltip": "Jungle"
            },
            "seasons": {
              "first": 2019,
              "last": 2025,
              "label": "2019–2025",
              "tooltip": "Seasons in this scope"
            },
            "teams": [
              {
                "id": "cf135046cf0b882a",
                "label": "LNG Esports",
                "short": "LNG",
                "region": "China",
                "seasons": {
                  "first": 2024,
                  "last": 2025,
                  "label": "2024–2025",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "LNG Esports"
              },
              {
                "id": "6885a45623ba6fc5",
                "label": "Weibo Gaming",
                "short": "WBG",
                "region": "China",
                "seasons": {
                  "first": 2023,
                  "last": 2023,
                  "label": "2023",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Weibo Gaming"
              },
              {
                "id": "11d0df77c159dca0",
                "label": "Bilibili Gaming",
                "short": "BLG",
                "region": "China",
                "seasons": {
                  "first": 2021,
                  "last": 2022,
                  "label": "2021–2022",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Bilibili Gaming"
              },
              {
                "id": "e108c6e266e4d4db",
                "label": "Victory Five",
                "short": "V5",
                "region": "China",
                "seasons": {
                  "first": 2020,
                  "last": 2021,
                  "label": "2020–2021",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Victory Five"
              }
            ],
            "teams_total": 5,
            "teams_shown": 4,
            "media": {
              "kind": "player",
              "key": null
            },
            "tooltip": "Weiwei"
          }
        ]
      }
    },
    "result": {
      "is_correct": false,
      "selected_answer": "H4cker",
      "correct_answer": "Weiwei",
      "explanation": "Weiwei has 25% win rate on Udyr versus H4cker's 7%, in LPL (authority revision 2 / 1).",
      "reveal": {
        "correct_candidate": "Weiwei",
        "metric": "win_rate",
        "shape": "champion_pairwise",
        "values": {
          "Weiwei": 0.25,
          "H4cker": 0.07142857142857142
        },
        "anchor_type": "champion_scope",
        "anchor": "Udyr|Tencent LoL Pro League",
        "scope_label": "Udyr in LPL",
        "authority_revision": null,
        "authority_revisions": {
          "Weiwei": 2,
          "H4cker": 1
        },
        "metric_definition_version": "player_champion_v1",
        "explanation": "Weiwei has 25% win rate on Udyr versus H4cker's 7%, in LPL (authority revision 2 / 1)."
      },
      "evidence": {
        "metric": {
          "id": "win_rate",
          "label": "WIN RATE",
          "kind": "rate",
          "tooltip": "Share of games won in this scope"
        },
        "form": "pairwise",
        "scope_label": "Udyr in LPL",
        "correct_label": "Weiwei",
        "subjects": [
          {
            "label": "H4cker",
            "games": 14,
            "wins": 1,
            "losses": 13,
            "win_rate": 0.07142857142857142,
            "display": "7.1%"
          },
          {
            "label": "Weiwei",
            "games": 12,
            "wins": 3,
            "losses": 9,
            "win_rate": 0.25,
            "display": "25.0%"
          }
        ],
        "authority": {
          "revision": null,
          "revisions": {
            "Weiwei": 2,
            "H4cker": 1
          },
          "metric_definition_version": "player_champion_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "player_champion": {
    "question": {
      "index": 0,
      "number": 1,
      "total": 10,
      "topic": "Player",
      "question_id": "1c3aaff700cf2589",
      "question_text": "In First Stand, which champion does Zeka have the higher share of games played on: Azir or Ahri?",
      "choices": [
        "Ahri",
        "Azir"
      ],
      "presentation": {
        "shape": "player_pairwise",
        "player_display": "Zeka",
        "candidates": [
          "Ahri",
          "Azir"
        ],
        "champion_key": null,
        "metric": "champion_share",
        "scope_label": "Zeka's career in First Stand"
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "player_champion",
          "label": "Player → Champion",
          "anchor_entity": "player",
          "subject_entity": "champion"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "First Stand",
            "type": "league",
            "label": "First Stand",
            "tooltip": "First Stand",
            "priority": 10
          },
          {
            "id": "all_time",
            "type": "all_time",
            "label": "ALL TIME",
            "tooltip": "Every season available in this scope",
            "priority": 90
          }
        ],
        "metric": {
          "id": "champion_share",
          "label": "CHAMPION SHARE",
          "kind": "rate",
          "tooltip": "Share of all games in this scope played on this champion"
        },
        "anchor": {
          "kind": "player",
          "label": "Zeka",
          "id": "df509a0b84413082",
          "role": {
            "id": "mid",
            "label": "MID",
            "tooltip": "Mid lane"
          },
          "seasons": {
            "first": 2025,
            "last": 2025,
            "label": "2025",
            "tooltip": "Seasons in this scope"
          },
          "teams": [
            {
              "id": "cb0d5d36c19b22ef",
              "label": "Hanwha Life Esports",
              "short": "HLE",
              "region": "Korea",
              "seasons": {
                "first": 2025,
                "last": 2025,
                "label": "2025",
                "tooltip": "Seasons in this scope"
              },
              "media": {
                "kind": "team",
                "key": null
              },
              "tooltip": "Hanwha Life Esports"
            }
          ],
          "teams_total": 1,
          "teams_shown": 1,
          "media": {
            "kind": "player",
            "key": null
          },
          "tooltip": "Zeka"
        },
        "subjects": [
          {
            "kind": "champion",
            "label": "Ahri",
            "id": "Ahri",
            "media": {
              "kind": "champion",
              "key": "Ahri"
            },
            "tooltip": "Ahri"
          },
          {
            "kind": "champion",
            "label": "Azir",
            "id": "Azir",
            "media": {
              "kind": "champion",
              "key": "Azir"
            },
            "tooltip": "Azir"
          }
        ]
      }
    },
    "result": {
      "is_correct": false,
      "selected_answer": "Ahri",
      "correct_answer": "Azir",
      "explanation": "Zeka has 18% share of games played on Azir versus 6% on Ahri, in First Stand (authority revision 1).",
      "reveal": {
        "correct_candidate": "Azir",
        "metric": "champion_share",
        "shape": "player_pairwise",
        "values": {
          "Azir": 0.17647058823529413,
          "Ahri": 0.058823529411764705
        },
        "anchor_type": "player_scope",
        "anchor": "Zeka (Kim Geon-woo)|career|First Stand",
        "scope_label": "Zeka's career in First Stand",
        "authority_revision": 1,
        "authority_revisions": null,
        "metric_definition_version": "player_champion_v1",
        "explanation": "Zeka has 18% share of games played on Azir versus 6% on Ahri, in First Stand (authority revision 1)."
      },
      "evidence": {
        "metric": {
          "id": "champion_share",
          "label": "CHAMPION SHARE",
          "kind": "rate",
          "tooltip": "Share of all games in this scope played on this champion"
        },
        "form": "pairwise",
        "scope_label": "Zeka's career in First Stand",
        "correct_label": "Azir",
        "subjects": [
          {
            "label": "Ahri",
            "games": 1,
            "total_games_in_scope": 17,
            "champion_share": 0.058823529411764705,
            "display": "5.9%"
          },
          {
            "label": "Azir",
            "games": 3,
            "total_games_in_scope": 17,
            "champion_share": 0.17647058823529413,
            "display": "17.6%"
          }
        ],
        "authority": {
          "revision": 1,
          "revisions": null,
          "metric_definition_version": "player_champion_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "team_champion": {
    "question": {
      "index": 7,
      "number": 8,
      "total": 10,
      "topic": "Team",
      "question_id": "ffbb423addb03c36",
      "question_text": "In LoL Champions Korea, which of these champions does Kiwoom DRX have the most wins on?",
      "choices": [
        "Xin Zhao",
        "Lee Sin",
        "Nautilus",
        "Sejuani"
      ],
      "presentation": {
        "shape": "team_ranking",
        "candidates": [
          "Xin Zhao",
          "Lee Sin",
          "Nautilus",
          "Sejuani"
        ],
        "champion_key": null,
        "team_display": "Kiwoom DRX",
        "metric": "wins",
        "scope_label": "Kiwoom DRX in LoL Champions Korea"
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "team_champion",
          "label": "Team → Champion",
          "anchor_entity": "team",
          "subject_entity": "champion"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "LoL Champions Korea",
            "type": "league",
            "label": "LCK",
            "tooltip": "LoL Champions Korea",
            "priority": 10
          },
          {
            "id": "all_time",
            "type": "all_time",
            "label": "ALL TIME",
            "tooltip": "Every season available in this scope",
            "priority": 90
          }
        ],
        "metric": {
          "id": "wins",
          "label": "WINS",
          "kind": "count",
          "tooltip": "Games won on this champion in this scope"
        },
        "anchor": {
          "kind": "team",
          "label": "Kiwoom DRX",
          "id": "65e9e3f46614f28c",
          "short": "KRX",
          "region": "Korea",
          "seasons": {
            "first": 2020,
            "last": 2026,
            "label": "2020–2026",
            "tooltip": "Seasons in this scope"
          },
          "leagues": [
            {
              "id": "LoL Champions Korea",
              "label": "LCK",
              "media": {
                "kind": "league",
                "key": null
              },
              "tooltip": "LoL Champions Korea"
            }
          ],
          "leagues_total": 1,
          "leagues_shown": 1,
          "media": {
            "kind": "team",
            "key": null
          },
          "tooltip": "Kiwoom DRX"
        },
        "subjects": [
          {
            "kind": "champion",
            "label": "Xin Zhao",
            "id": "Xin Zhao",
            "media": {
              "kind": "champion",
              "key": "Xin Zhao"
            },
            "tooltip": "Xin Zhao"
          },
          {
            "kind": "champion",
            "label": "Lee Sin",
            "id": "Lee Sin",
            "media": {
              "kind": "champion",
              "key": "Lee Sin"
            },
            "tooltip": "Lee Sin"
          },
          {
            "kind": "champion",
            "label": "Nautilus",
            "id": "Nautilus",
            "media": {
              "kind": "champion",
              "key": "Nautilus"
            },
            "tooltip": "Nautilus"
          },
          {
            "kind": "champion",
            "label": "Sejuani",
            "id": "Sejuani",
            "media": {
              "kind": "champion",
              "key": "Sejuani"
            },
            "tooltip": "Sejuani"
          }
        ]
      }
    },
    "result": {
      "is_correct": false,
      "selected_answer": "Xin Zhao",
      "correct_answer": "Lee Sin",
      "explanation": "Kiwoom DRX leads with 35 wins on Lee Sin, in LoL Champions Korea (authority revision 2).",
      "reveal": {
        "correct_candidate": "Lee Sin",
        "metric": "wins",
        "shape": "team_ranking",
        "values": {
          "Lee Sin": 35,
          "Nautilus": 31,
          "Xin Zhao": 31,
          "Sejuani": 29
        },
        "anchor_type": "team_scope",
        "anchor": "Kiwoom DRX|team|LoL Champions Korea",
        "scope_label": "Kiwoom DRX in LoL Champions Korea",
        "authority_revision": 2,
        "authority_revisions": null,
        "metric_definition_version": "team_champion_v1",
        "explanation": "Kiwoom DRX leads with 35 wins on Lee Sin, in LoL Champions Korea (authority revision 2)."
      },
      "evidence": {
        "metric": {
          "id": "wins",
          "label": "WINS",
          "kind": "count",
          "tooltip": "Games won on this champion in this scope"
        },
        "form": "ranking",
        "scope_label": "Kiwoom DRX in LoL Champions Korea",
        "correct_label": "Lee Sin",
        "subjects": [
          {
            "label": "Xin Zhao",
            "games": 64,
            "wins": 31,
            "display": "31"
          },
          {
            "label": "Lee Sin",
            "games": 73,
            "wins": 35,
            "display": "35"
          },
          {
            "label": "Nautilus",
            "games": 68,
            "wins": 31,
            "display": "31"
          },
          {
            "label": "Sejuani",
            "games": 62,
            "wins": 29,
            "display": "29"
          }
        ],
        "authority": {
          "revision": 2,
          "revisions": null,
          "metric_definition_version": "team_champion_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "champion_team": {
    "question": {
      "index": 1,
      "number": 2,
      "total": 10,
      "topic": "Team",
      "question_id": "457a25c8a2cb9af3",
      "question_text": "In World Championship, which team has more games played on Gangplank: Splyce or Fnatic?",
      "choices": [
        "Splyce",
        "Fnatic"
      ],
      "presentation": {
        "shape": "champion_pairwise",
        "candidates": [
          "Splyce",
          "Fnatic"
        ],
        "champion_key": "Gangplank",
        "team_display": null,
        "metric": "games_played",
        "scope_label": "Gangplank in World Championship"
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "champion_team",
          "label": "Champion → Team",
          "anchor_entity": "champion",
          "subject_entity": "team"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "World Championship",
            "type": "league",
            "label": "WORLDS",
            "tooltip": "World Championship",
            "priority": 10
          },
          {
            "id": "all_time",
            "type": "all_time",
            "label": "ALL TIME",
            "tooltip": "Every season available in this scope",
            "priority": 90
          }
        ],
        "metric": {
          "id": "games_played",
          "label": "GAMES",
          "kind": "count",
          "tooltip": "Games played on this champion in this scope"
        },
        "anchor": {
          "kind": "champion",
          "label": "Gangplank",
          "id": "Gangplank",
          "media": {
            "kind": "champion",
            "key": "Gangplank"
          },
          "tooltip": "Gangplank"
        },
        "subjects": [
          {
            "kind": "team",
            "label": "Splyce",
            "id": "1fa2ea9bcafb8cea",
            "short": "SPY",
            "region": "Europe",
            "seasons": {
              "first": 2016,
              "last": 2019,
              "label": "2016–2019",
              "tooltip": "Seasons in this scope"
            },
            "leagues": [
              {
                "id": "World Championship",
                "label": "Worlds",
                "media": {
                  "kind": "league",
                  "key": null
                },
                "tooltip": "World Championship"
              }
            ],
            "leagues_total": 1,
            "leagues_shown": 1,
            "media": {
              "kind": "team",
              "key": null
            },
            "tooltip": "Splyce"
          },
          {
            "kind": "team",
            "label": "Fnatic",
            "id": "aaadbcf4161e7b58",
            "short": "FNC",
            "region": "EMEA",
            "seasons": {
              "first": 2011,
              "last": 2025,
              "label": "2011–2025",
              "tooltip": "Seasons in this scope"
            },
            "leagues": [
              {
                "id": "World Championship",
                "label": "Worlds",
                "media": {
                  "kind": "league",
                  "key": null
                },
                "tooltip": "World Championship"
              }
            ],
            "leagues_total": 1,
            "leagues_shown": 1,
            "media": {
              "kind": "team",
              "key": null
            },
            "tooltip": "Fnatic"
          }
        ]
      }
    },
    "result": {
      "is_correct": true,
      "selected_answer": "Splyce",
      "correct_answer": "Splyce",
      "explanation": "Splyce has 16 games played on Gangplank versus Fnatic's 7, in World Championship (authority revision 1 / 2).",
      "reveal": {
        "correct_candidate": "Splyce",
        "metric": "games_played",
        "shape": "champion_pairwise",
        "values": {
          "Splyce": 16,
          "Fnatic": 7
        },
        "anchor_type": "champion_scope",
        "anchor": "Gangplank|World Championship",
        "scope_label": "Gangplank in World Championship",
        "authority_revision": null,
        "authority_revisions": {
          "Splyce": 1,
          "Fnatic": 2
        },
        "metric_definition_version": "team_champion_v1",
        "explanation": "Splyce has 16 games played on Gangplank versus Fnatic's 7, in World Championship (authority revision 1 / 2)."
      },
      "evidence": {
        "metric": {
          "id": "games_played",
          "label": "GAMES",
          "kind": "count",
          "tooltip": "Games played on this champion in this scope"
        },
        "form": "pairwise",
        "scope_label": "Gangplank in World Championship",
        "correct_label": "Splyce",
        "subjects": [
          {
            "label": "Splyce",
            "games": 16,
            "wins": 11,
            "display": "16"
          },
          {
            "label": "Fnatic",
            "games": 7,
            "wins": 3,
            "display": "7"
          }
        ],
        "authority": {
          "revision": null,
          "revisions": {
            "Splyce": 1,
            "Fnatic": 2
          },
          "metric_definition_version": "team_champion_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "scope_champion": {
    "question": {
      "index": 2,
      "number": 3,
      "total": 10,
      "topic": "Champion",
      "question_id": "d456a6872599abac",
      "question_text": "Which of these champions had the highest ban count in Mid-Season Invitational (patch 7.08)?",
      "choices": [
        "Kennen",
        "LeBlanc",
        "Fizz",
        "Lulu"
      ],
      "presentation": {
        "shape": "ranking",
        "scope_key": "Mid-Season Invitational|ALL|7.08",
        "patch": "7.08",
        "candidates": [
          "Kennen",
          "LeBlanc",
          "Fizz",
          "Lulu"
        ],
        "league_slug": "Mid-Season Invitational",
        "metric": "bans",
        "tournament_id": null
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "scope_champion",
          "label": "Scope → Champion",
          "anchor_entity": "scope",
          "subject_entity": "champion"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "Mid-Season Invitational",
            "type": "league",
            "label": "MSI",
            "tooltip": "Mid-Season Invitational",
            "priority": 10
          },
          {
            "id": "2017",
            "type": "year",
            "label": "2017",
            "tooltip": "Competitive season",
            "priority": 30
          },
          {
            "id": "7.08",
            "type": "patch",
            "label": "PATCH 7.08",
            "tooltip": "Game patch",
            "priority": 40
          }
        ],
        "metric": {
          "id": "bans",
          "label": "BANS",
          "kind": "count",
          "tooltip": "Times banned in this scope"
        },
        "anchor": {
          "kind": "scope",
          "label": "Mid-Season Invitational (patch 7.08)",
          "id": "Mid-Season Invitational|ALL|7.08",
          "media": {
            "kind": "scope",
            "key": null
          },
          "tooltip": "Mid-Season Invitational (patch 7.08)"
        },
        "subjects": [
          {
            "kind": "champion",
            "label": "Kennen",
            "id": "Kennen",
            "media": {
              "kind": "champion",
              "key": "Kennen"
            },
            "tooltip": "Kennen"
          },
          {
            "kind": "champion",
            "label": "LeBlanc",
            "id": "LeBlanc",
            "media": {
              "kind": "champion",
              "key": "LeBlanc"
            },
            "tooltip": "LeBlanc"
          },
          {
            "kind": "champion",
            "label": "Fizz",
            "id": "Fizz",
            "media": {
              "kind": "champion",
              "key": "Fizz"
            },
            "tooltip": "Fizz"
          },
          {
            "kind": "champion",
            "label": "Lulu",
            "id": "Lulu",
            "media": {
              "kind": "champion",
              "key": "Lulu"
            },
            "tooltip": "Lulu"
          }
        ]
      }
    },
    "result": {
      "is_correct": true,
      "selected_answer": "Kennen",
      "correct_answer": "Kennen",
      "explanation": "Kennen led with 54 ban count in Mid-Season Invitational (patch 7.08) (authority revision 1).",
      "reveal": {
        "correct_champion": "Kennen",
        "metric": "bans",
        "shape": "ranking",
        "values": {
          "Kennen": 54,
          "LeBlanc": 49,
          "Lulu": 41,
          "Fizz": 37
        },
        "scope_key": "Mid-Season Invitational|ALL|7.08",
        "patch": "7.08",
        "authority_revision": 1,
        "metric_definition_version": "pick_ban_presence_v1",
        "explanation": "Kennen led with 54 ban count in Mid-Season Invitational (patch 7.08) (authority revision 1)."
      },
      "evidence": {
        "metric": {
          "id": "bans",
          "label": "BANS",
          "kind": "count",
          "tooltip": "Times banned in this scope"
        },
        "form": "ranking",
        "scope_label": "Mid-Season Invitational (patch 7.08)",
        "correct_label": "Kennen",
        "subjects": [
          {
            "label": "Kennen",
            "bans": 54,
            "games_banned": 54,
            "scope_games": 77,
            "display": "54"
          },
          {
            "label": "LeBlanc",
            "bans": 49,
            "games_banned": 49,
            "scope_games": 77,
            "display": "49"
          },
          {
            "label": "Fizz",
            "bans": 37,
            "games_banned": 37,
            "scope_games": 77,
            "display": "37"
          },
          {
            "label": "Lulu",
            "bans": 41,
            "games_banned": 41,
            "scope_games": 77,
            "display": "41"
          }
        ],
        "authority": {
          "revision": 1,
          "revisions": null,
          "metric_definition_version": "pick_ban_presence_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "recent": {
    "question": {
      "index": 5,
      "number": 6,
      "total": 10,
      "topic": "Champion",
      "question_id": "5ee80dd077e3ac4d",
      "question_text": "In Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09), which champion had the higher pick count: Viktor or Jarvan IV?",
      "choices": [
        "Jarvan IV",
        "Viktor"
      ],
      "presentation": {
        "shape": "pairwise",
        "scope_key": "Esports World Cup|Esports World Cup 2026 Online Qualifier: EMEA|26.09",
        "patch": "26.09",
        "candidates": [
          "Jarvan IV",
          "Viktor"
        ],
        "league_slug": "Esports World Cup",
        "metric": "picks",
        "tournament_id": "Esports World Cup 2026 Online Qualifier: EMEA"
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "scope_champion",
          "label": "Scope → Champion",
          "anchor_entity": "scope",
          "subject_entity": "champion"
        },
        "editorial_tags": [
          {
            "id": "recent_esports",
            "label": "Recent Esports Trivia",
            "tooltip": "The competition this question is scoped to was played in 2025 or 2026."
          }
        ],
        "scope_tags": [
          {
            "id": "Esports World Cup 2026 Online Qualifier: EMEA",
            "type": "tournament",
            "label": "EWC 2026",
            "tooltip": "Esports World Cup 2026 Online Qualifier: EMEA",
            "priority": 20
          },
          {
            "id": "26.09",
            "type": "patch",
            "label": "PATCH 26.09",
            "tooltip": "Game patch",
            "priority": 40
          }
        ],
        "metric": {
          "id": "picks",
          "label": "PICKS",
          "kind": "count",
          "tooltip": "Times picked in this scope"
        },
        "anchor": {
          "kind": "scope",
          "label": "Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09)",
          "id": "Esports World Cup|Esports World Cup 2026 Online Qualifier: EMEA|26.09",
          "media": {
            "kind": "scope",
            "key": null
          },
          "tooltip": "Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09)"
        },
        "subjects": [
          {
            "kind": "champion",
            "label": "Jarvan IV",
            "id": "Jarvan IV",
            "media": {
              "kind": "champion",
              "key": "Jarvan IV"
            },
            "tooltip": "Jarvan IV"
          },
          {
            "kind": "champion",
            "label": "Viktor",
            "id": "Viktor",
            "media": {
              "kind": "champion",
              "key": "Viktor"
            },
            "tooltip": "Viktor"
          }
        ]
      }
    },
    "result": {
      "is_correct": false,
      "selected_answer": "Jarvan IV",
      "correct_answer": "Viktor",
      "explanation": "Viktor had 6 pick count versus Jarvan IV's 4 in Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09) (authority revision 1).",
      "reveal": {
        "correct_champion": "Viktor",
        "metric": "picks",
        "shape": "pairwise",
        "values": {
          "Viktor": 6,
          "Jarvan IV": 4
        },
        "scope_key": "Esports World Cup|Esports World Cup 2026 Online Qualifier: EMEA|26.09",
        "patch": "26.09",
        "authority_revision": 1,
        "metric_definition_version": "pick_ban_presence_v1",
        "explanation": "Viktor had 6 pick count versus Jarvan IV's 4 in Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09) (authority revision 1)."
      },
      "evidence": {
        "metric": {
          "id": "picks",
          "label": "PICKS",
          "kind": "count",
          "tooltip": "Times picked in this scope"
        },
        "form": "pairwise",
        "scope_label": "Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09)",
        "correct_label": "Viktor",
        "subjects": [
          {
            "label": "Jarvan IV",
            "picks": 4,
            "games_picked": 4,
            "scope_games": 22,
            "display": "4"
          },
          {
            "label": "Viktor",
            "picks": 6,
            "games_picked": 6,
            "scope_games": 22,
            "display": "6"
          }
        ],
        "authority": {
          "revision": 1,
          "revisions": null,
          "metric_definition_version": "pick_ban_presence_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "tournament": {
    "question": {
      "index": 5,
      "number": 6,
      "total": 10,
      "topic": "Champion",
      "question_id": "5ee80dd077e3ac4d",
      "question_text": "In Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09), which champion had the higher pick count: Viktor or Jarvan IV?",
      "choices": [
        "Jarvan IV",
        "Viktor"
      ],
      "presentation": {
        "shape": "pairwise",
        "scope_key": "Esports World Cup|Esports World Cup 2026 Online Qualifier: EMEA|26.09",
        "patch": "26.09",
        "candidates": [
          "Jarvan IV",
          "Viktor"
        ],
        "league_slug": "Esports World Cup",
        "metric": "picks",
        "tournament_id": "Esports World Cup 2026 Online Qualifier: EMEA"
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "scope_champion",
          "label": "Scope → Champion",
          "anchor_entity": "scope",
          "subject_entity": "champion"
        },
        "editorial_tags": [
          {
            "id": "recent_esports",
            "label": "Recent Esports Trivia",
            "tooltip": "The competition this question is scoped to was played in 2025 or 2026."
          }
        ],
        "scope_tags": [
          {
            "id": "Esports World Cup 2026 Online Qualifier: EMEA",
            "type": "tournament",
            "label": "EWC 2026",
            "tooltip": "Esports World Cup 2026 Online Qualifier: EMEA",
            "priority": 20
          },
          {
            "id": "26.09",
            "type": "patch",
            "label": "PATCH 26.09",
            "tooltip": "Game patch",
            "priority": 40
          }
        ],
        "metric": {
          "id": "picks",
          "label": "PICKS",
          "kind": "count",
          "tooltip": "Times picked in this scope"
        },
        "anchor": {
          "kind": "scope",
          "label": "Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09)",
          "id": "Esports World Cup|Esports World Cup 2026 Online Qualifier: EMEA|26.09",
          "media": {
            "kind": "scope",
            "key": null
          },
          "tooltip": "Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09)"
        },
        "subjects": [
          {
            "kind": "champion",
            "label": "Jarvan IV",
            "id": "Jarvan IV",
            "media": {
              "kind": "champion",
              "key": "Jarvan IV"
            },
            "tooltip": "Jarvan IV"
          },
          {
            "kind": "champion",
            "label": "Viktor",
            "id": "Viktor",
            "media": {
              "kind": "champion",
              "key": "Viktor"
            },
            "tooltip": "Viktor"
          }
        ]
      }
    },
    "result": {
      "is_correct": false,
      "selected_answer": "Jarvan IV",
      "correct_answer": "Viktor",
      "explanation": "Viktor had 6 pick count versus Jarvan IV's 4 in Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09) (authority revision 1).",
      "reveal": {
        "correct_champion": "Viktor",
        "metric": "picks",
        "shape": "pairwise",
        "values": {
          "Viktor": 6,
          "Jarvan IV": 4
        },
        "scope_key": "Esports World Cup|Esports World Cup 2026 Online Qualifier: EMEA|26.09",
        "patch": "26.09",
        "authority_revision": 1,
        "metric_definition_version": "pick_ban_presence_v1",
        "explanation": "Viktor had 6 pick count versus Jarvan IV's 4 in Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09) (authority revision 1)."
      },
      "evidence": {
        "metric": {
          "id": "picks",
          "label": "PICKS",
          "kind": "count",
          "tooltip": "Times picked in this scope"
        },
        "form": "pairwise",
        "scope_label": "Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09)",
        "correct_label": "Viktor",
        "subjects": [
          {
            "label": "Jarvan IV",
            "picks": 4,
            "games_picked": 4,
            "scope_games": 22,
            "display": "4"
          },
          {
            "label": "Viktor",
            "picks": 6,
            "games_picked": 6,
            "scope_games": 22,
            "display": "6"
          }
        ],
        "authority": {
          "revision": 1,
          "revisions": null,
          "metric_definition_version": "pick_ban_presence_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "patch": {
    "question": {
      "index": 2,
      "number": 3,
      "total": 10,
      "topic": "Champion",
      "question_id": "d456a6872599abac",
      "question_text": "Which of these champions had the highest ban count in Mid-Season Invitational (patch 7.08)?",
      "choices": [
        "Kennen",
        "LeBlanc",
        "Fizz",
        "Lulu"
      ],
      "presentation": {
        "shape": "ranking",
        "scope_key": "Mid-Season Invitational|ALL|7.08",
        "patch": "7.08",
        "candidates": [
          "Kennen",
          "LeBlanc",
          "Fizz",
          "Lulu"
        ],
        "league_slug": "Mid-Season Invitational",
        "metric": "bans",
        "tournament_id": null
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "scope_champion",
          "label": "Scope → Champion",
          "anchor_entity": "scope",
          "subject_entity": "champion"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "Mid-Season Invitational",
            "type": "league",
            "label": "MSI",
            "tooltip": "Mid-Season Invitational",
            "priority": 10
          },
          {
            "id": "2017",
            "type": "year",
            "label": "2017",
            "tooltip": "Competitive season",
            "priority": 30
          },
          {
            "id": "7.08",
            "type": "patch",
            "label": "PATCH 7.08",
            "tooltip": "Game patch",
            "priority": 40
          }
        ],
        "metric": {
          "id": "bans",
          "label": "BANS",
          "kind": "count",
          "tooltip": "Times banned in this scope"
        },
        "anchor": {
          "kind": "scope",
          "label": "Mid-Season Invitational (patch 7.08)",
          "id": "Mid-Season Invitational|ALL|7.08",
          "media": {
            "kind": "scope",
            "key": null
          },
          "tooltip": "Mid-Season Invitational (patch 7.08)"
        },
        "subjects": [
          {
            "kind": "champion",
            "label": "Kennen",
            "id": "Kennen",
            "media": {
              "kind": "champion",
              "key": "Kennen"
            },
            "tooltip": "Kennen"
          },
          {
            "kind": "champion",
            "label": "LeBlanc",
            "id": "LeBlanc",
            "media": {
              "kind": "champion",
              "key": "LeBlanc"
            },
            "tooltip": "LeBlanc"
          },
          {
            "kind": "champion",
            "label": "Fizz",
            "id": "Fizz",
            "media": {
              "kind": "champion",
              "key": "Fizz"
            },
            "tooltip": "Fizz"
          },
          {
            "kind": "champion",
            "label": "Lulu",
            "id": "Lulu",
            "media": {
              "kind": "champion",
              "key": "Lulu"
            },
            "tooltip": "Lulu"
          }
        ]
      }
    },
    "result": {
      "is_correct": true,
      "selected_answer": "Kennen",
      "correct_answer": "Kennen",
      "explanation": "Kennen led with 54 ban count in Mid-Season Invitational (patch 7.08) (authority revision 1).",
      "reveal": {
        "correct_champion": "Kennen",
        "metric": "bans",
        "shape": "ranking",
        "values": {
          "Kennen": 54,
          "LeBlanc": 49,
          "Lulu": 41,
          "Fizz": 37
        },
        "scope_key": "Mid-Season Invitational|ALL|7.08",
        "patch": "7.08",
        "authority_revision": 1,
        "metric_definition_version": "pick_ban_presence_v1",
        "explanation": "Kennen led with 54 ban count in Mid-Season Invitational (patch 7.08) (authority revision 1)."
      },
      "evidence": {
        "metric": {
          "id": "bans",
          "label": "BANS",
          "kind": "count",
          "tooltip": "Times banned in this scope"
        },
        "form": "ranking",
        "scope_label": "Mid-Season Invitational (patch 7.08)",
        "correct_label": "Kennen",
        "subjects": [
          {
            "label": "Kennen",
            "bans": 54,
            "games_banned": 54,
            "scope_games": 77,
            "display": "54"
          },
          {
            "label": "LeBlanc",
            "bans": 49,
            "games_banned": 49,
            "scope_games": 77,
            "display": "49"
          },
          {
            "label": "Fizz",
            "bans": 37,
            "games_banned": 37,
            "scope_games": 77,
            "display": "37"
          },
          {
            "label": "Lulu",
            "bans": 41,
            "games_banned": 41,
            "scope_games": 77,
            "display": "41"
          }
        ],
        "authority": {
          "revision": 1,
          "revisions": null,
          "metric_definition_version": "pick_ban_presence_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "all_time": {
    "question": {
      "index": 0,
      "number": 1,
      "total": 10,
      "topic": "Player",
      "question_id": "1c3aaff700cf2589",
      "question_text": "In First Stand, which champion does Zeka have the higher share of games played on: Azir or Ahri?",
      "choices": [
        "Ahri",
        "Azir"
      ],
      "presentation": {
        "shape": "player_pairwise",
        "player_display": "Zeka",
        "candidates": [
          "Ahri",
          "Azir"
        ],
        "champion_key": null,
        "metric": "champion_share",
        "scope_label": "Zeka's career in First Stand"
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "player_champion",
          "label": "Player → Champion",
          "anchor_entity": "player",
          "subject_entity": "champion"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "First Stand",
            "type": "league",
            "label": "First Stand",
            "tooltip": "First Stand",
            "priority": 10
          },
          {
            "id": "all_time",
            "type": "all_time",
            "label": "ALL TIME",
            "tooltip": "Every season available in this scope",
            "priority": 90
          }
        ],
        "metric": {
          "id": "champion_share",
          "label": "CHAMPION SHARE",
          "kind": "rate",
          "tooltip": "Share of all games in this scope played on this champion"
        },
        "anchor": {
          "kind": "player",
          "label": "Zeka",
          "id": "df509a0b84413082",
          "role": {
            "id": "mid",
            "label": "MID",
            "tooltip": "Mid lane"
          },
          "seasons": {
            "first": 2025,
            "last": 2025,
            "label": "2025",
            "tooltip": "Seasons in this scope"
          },
          "teams": [
            {
              "id": "cb0d5d36c19b22ef",
              "label": "Hanwha Life Esports",
              "short": "HLE",
              "region": "Korea",
              "seasons": {
                "first": 2025,
                "last": 2025,
                "label": "2025",
                "tooltip": "Seasons in this scope"
              },
              "media": {
                "kind": "team",
                "key": null
              },
              "tooltip": "Hanwha Life Esports"
            }
          ],
          "teams_total": 1,
          "teams_shown": 1,
          "media": {
            "kind": "player",
            "key": null
          },
          "tooltip": "Zeka"
        },
        "subjects": [
          {
            "kind": "champion",
            "label": "Ahri",
            "id": "Ahri",
            "media": {
              "kind": "champion",
              "key": "Ahri"
            },
            "tooltip": "Ahri"
          },
          {
            "kind": "champion",
            "label": "Azir",
            "id": "Azir",
            "media": {
              "kind": "champion",
              "key": "Azir"
            },
            "tooltip": "Azir"
          }
        ]
      }
    },
    "result": {
      "is_correct": false,
      "selected_answer": "Ahri",
      "correct_answer": "Azir",
      "explanation": "Zeka has 18% share of games played on Azir versus 6% on Ahri, in First Stand (authority revision 1).",
      "reveal": {
        "correct_candidate": "Azir",
        "metric": "champion_share",
        "shape": "player_pairwise",
        "values": {
          "Azir": 0.17647058823529413,
          "Ahri": 0.058823529411764705
        },
        "anchor_type": "player_scope",
        "anchor": "Zeka (Kim Geon-woo)|career|First Stand",
        "scope_label": "Zeka's career in First Stand",
        "authority_revision": 1,
        "authority_revisions": null,
        "metric_definition_version": "player_champion_v1",
        "explanation": "Zeka has 18% share of games played on Azir versus 6% on Ahri, in First Stand (authority revision 1)."
      },
      "evidence": {
        "metric": {
          "id": "champion_share",
          "label": "CHAMPION SHARE",
          "kind": "rate",
          "tooltip": "Share of all games in this scope played on this champion"
        },
        "form": "pairwise",
        "scope_label": "Zeka's career in First Stand",
        "correct_label": "Azir",
        "subjects": [
          {
            "label": "Ahri",
            "games": 1,
            "total_games_in_scope": 17,
            "champion_share": 0.058823529411764705,
            "display": "5.9%"
          },
          {
            "label": "Azir",
            "games": 3,
            "total_games_in_scope": 17,
            "champion_share": 0.17647058823529413,
            "display": "17.6%"
          }
        ],
        "authority": {
          "revision": 1,
          "revisions": null,
          "metric_definition_version": "player_champion_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "flex": {
    "question": {
      "index": 1,
      "number": 2,
      "total": 10,
      "topic": "Player",
      "question_id": "c1b648eb8e3ae164",
      "question_text": "In Europe League Championship Series, which of these players has the most games played on Twisted Fate?",
      "choices": [
        "xPeke",
        "Nukeduck",
        "Exter",
        "Froggen"
      ],
      "presentation": {
        "shape": "champion_ranking",
        "player_display": null,
        "candidates": [
          "xPeke",
          "Nukeduck",
          "Exter",
          "Froggen"
        ],
        "champion_key": "Twisted Fate",
        "metric": "games_played",
        "scope_label": "Twisted Fate in Europe League Championship Series"
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "champion_player",
          "label": "Champion → Player",
          "anchor_entity": "champion",
          "subject_entity": "player"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "Europe League Championship Series",
            "type": "league",
            "label": "Europe League Championship Series",
            "tooltip": "Europe League Championship Series",
            "priority": 10
          },
          {
            "id": "all_time",
            "type": "all_time",
            "label": "ALL TIME",
            "tooltip": "Every season available in this scope",
            "priority": 90
          }
        ],
        "metric": {
          "id": "games_played",
          "label": "GAMES",
          "kind": "count",
          "tooltip": "Games played on this champion in this scope"
        },
        "anchor": {
          "kind": "champion",
          "label": "Twisted Fate",
          "id": "Twisted Fate",
          "media": {
            "kind": "champion",
            "key": "Twisted Fate"
          },
          "tooltip": "Twisted Fate"
        },
        "subjects": [
          {
            "kind": "player",
            "label": "xPeke",
            "id": "8c0303b57287f3c8",
            "role": {
              "id": "flex",
              "label": "FLEX",
              "tooltip": "No single role in this scope"
            },
            "seasons": {
              "first": 2013,
              "last": 2017,
              "label": "2013–2017",
              "tooltip": "Seasons in this scope"
            },
            "teams": [
              {
                "id": "00b4af452332a7f1",
                "label": "Origen",
                "short": "OG",
                "region": "Europe",
                "seasons": {
                  "first": 2015,
                  "last": 2017,
                  "label": "2015–2017",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Origen"
              },
              {
                "id": "aaadbcf4161e7b58",
                "label": "Fnatic",
                "short": "FNC",
                "region": "EMEA",
                "seasons": {
                  "first": 2013,
                  "last": 2014,
                  "label": "2013–2014",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Fnatic"
              }
            ],
            "teams_total": 2,
            "teams_shown": 2,
            "media": {
              "kind": "player",
              "key": null
            },
            "tooltip": "xPeke"
          },
          {
            "kind": "player",
            "label": "Nukeduck",
            "id": "498c9920ec112b5b",
            "role": {
              "id": "mid",
              "label": "MID",
              "tooltip": "Mid lane"
            },
            "seasons": {
              "first": 2013,
              "last": 2018,
              "label": "2013–2018",
              "tooltip": "Seasons in this scope"
            },
            "teams": [
              {
                "id": "a9b860913370c9d1",
                "label": "FC Schalke 04 Esports",
                "short": "S04",
                "region": "EMEA",
                "seasons": {
                  "first": 2016,
                  "last": 2018,
                  "label": "2016–2018",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "FC Schalke 04 Esports"
              },
              {
                "id": "63d720bbf074ca29",
                "label": "Team Vitality",
                "short": "VIT",
                "region": "EMEA",
                "seasons": {
                  "first": 2016,
                  "last": 2017,
                  "label": "2016–2017",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Team Vitality"
              },
              {
                "id": "c2160f098cbee1da",
                "label": "Team ROCCAT",
                "short": "ROC",
                "region": "Europe",
                "seasons": {
                  "first": 2015,
                  "last": 2015,
                  "label": "2015",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Team ROCCAT"
              },
              {
                "id": "5e3f02eeb2922264",
                "label": "Ninjas in Pyjamas",
                "short": "NIP",
                "region": "Europe",
                "seasons": {
                  "first": 2013,
                  "last": 2014,
                  "label": "2013–2014",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Ninjas in Pyjamas"
              }
            ],
            "teams_total": 7,
            "teams_shown": 4,
            "media": {
              "kind": "player",
              "key": null
            },
            "tooltip": "Nukeduck"
          },
          {
            "kind": "player",
            "label": "Exter",
            "id": "c43fbf12b2b738a9",
            "role": {
              "id": "mid",
              "label": "MID",
              "tooltip": "Mid lane"
            },
            "seasons": {
              "first": 2013,
              "last": 2013,
              "label": "2013",
              "tooltip": "Seasons in this scope"
            },
            "teams": [
              {
                "id": "54eed7e592e143df",
                "label": "Giants Gaming",
                "short": "GIA",
                "region": "Europe",
                "seasons": {
                  "first": 2013,
                  "last": 2013,
                  "label": "2013",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Giants Gaming"
              }
            ],
            "teams_total": 1,
            "teams_shown": 1,
            "media": {
              "kind": "player",
              "key": null
            },
            "tooltip": "Exter"
          },
          {
            "kind": "player",
            "label": "Froggen",
            "id": "6bf7d631f0b7f30c",
            "role": {
              "id": "mid",
              "label": "MID",
              "tooltip": "Mid lane"
            },
            "seasons": {
              "first": 2013,
              "last": 2015,
              "label": "2013–2015",
              "tooltip": "Seasons in this scope"
            },
            "teams": [
              {
                "id": "a8ac82d02c3d86dd",
                "label": "Elements",
                "short": "EL",
                "region": "Europe",
                "seasons": {
                  "first": 2015,
                  "last": 2015,
                  "label": "2015",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Elements"
              },
              {
                "id": "a9eecc87f275d527",
                "label": "Alliance",
                "short": "ALL",
                "region": "Europe",
                "seasons": {
                  "first": 2014,
                  "last": 2014,
                  "label": "2014",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Alliance"
              },
              {
                "id": "3196d20a8f2e93e4",
                "label": "Evil Geniuses.EU",
                "short": "EG",
                "region": "Europe",
                "seasons": {
                  "first": 2013,
                  "last": 2013,
                  "label": "2013",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Evil Geniuses.EU"
              }
            ],
            "teams_total": 3,
            "teams_shown": 3,
            "media": {
              "kind": "player",
              "key": null
            },
            "tooltip": "Froggen"
          }
        ]
      }
    },
    "result": {
      "is_correct": false,
      "selected_answer": "xPeke",
      "correct_answer": "Nukeduck",
      "explanation": "Nukeduck leads with 20 games played on Twisted Fate, in Europe League Championship Series (authority revision 2).",
      "reveal": {
        "correct_candidate": "Nukeduck",
        "metric": "games_played",
        "shape": "champion_ranking",
        "values": {
          "Nukeduck": 20,
          "xPeke": 18,
          "Froggen": 13,
          "Exter": 11
        },
        "anchor_type": "champion_scope",
        "anchor": "Twisted Fate|Europe League Championship Series",
        "scope_label": "Twisted Fate in Europe League Championship Series",
        "authority_revision": null,
        "authority_revisions": {
          "Nukeduck": 2,
          "xPeke": 2,
          "Froggen": 2,
          "Exter": 1
        },
        "metric_definition_version": "player_champion_v1",
        "explanation": "Nukeduck leads with 20 games played on Twisted Fate, in Europe League Championship Series (authority revision 2)."
      },
      "evidence": {
        "metric": {
          "id": "games_played",
          "label": "GAMES",
          "kind": "count",
          "tooltip": "Games played on this champion in this scope"
        },
        "form": "ranking",
        "scope_label": "Twisted Fate in Europe League Championship Series",
        "correct_label": "Nukeduck",
        "subjects": [
          {
            "label": "xPeke",
            "games": 18,
            "wins": 11,
            "display": "18"
          },
          {
            "label": "Nukeduck",
            "games": 20,
            "wins": 13,
            "display": "20"
          },
          {
            "label": "Exter",
            "games": 11,
            "wins": 5,
            "display": "11"
          },
          {
            "label": "Froggen",
            "games": 13,
            "wins": 11,
            "display": "13"
          }
        ],
        "authority": {
          "revision": null,
          "revisions": {
            "Nukeduck": 2,
            "xPeke": 2,
            "Froggen": 2,
            "Exter": 1
          },
          "metric_definition_version": "player_champion_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "multi_team": {
    "question": {
      "index": 3,
      "number": 4,
      "total": 10,
      "topic": "Player",
      "question_id": "a41f5173790f44eb",
      "question_text": "In LPL, who has the higher win rate on Udyr: Weiwei or H4cker?",
      "choices": [
        "H4cker",
        "Weiwei"
      ],
      "presentation": {
        "shape": "champion_pairwise",
        "player_display": null,
        "candidates": [
          "H4cker",
          "Weiwei"
        ],
        "champion_key": "Udyr",
        "metric": "win_rate",
        "scope_label": "Udyr in LPL"
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "champion_player",
          "label": "Champion → Player",
          "anchor_entity": "champion",
          "subject_entity": "player"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "Tencent LoL Pro League",
            "type": "league",
            "label": "LPL",
            "tooltip": "Tencent LoL Pro League",
            "priority": 10
          },
          {
            "id": "all_time",
            "type": "all_time",
            "label": "ALL TIME",
            "tooltip": "Every season available in this scope",
            "priority": 90
          }
        ],
        "metric": {
          "id": "win_rate",
          "label": "WIN RATE",
          "kind": "rate",
          "tooltip": "Share of games won in this scope"
        },
        "anchor": {
          "kind": "champion",
          "label": "Udyr",
          "id": "Udyr",
          "media": {
            "kind": "champion",
            "key": "Udyr"
          },
          "tooltip": "Udyr"
        },
        "subjects": [
          {
            "kind": "player",
            "label": "H4cker",
            "id": "623cfcce9d2deeae",
            "role": {
              "id": "jungle",
              "label": "JUNGLE",
              "tooltip": "Jungle"
            },
            "seasons": {
              "first": 2017,
              "last": 2024,
              "label": "2017–2024",
              "tooltip": "Seasons in this scope"
            },
            "teams": [
              {
                "id": "8798e53ee8333b5f",
                "label": "Ultra Prime",
                "short": "UP",
                "region": "China",
                "seasons": {
                  "first": 2021,
                  "last": 2024,
                  "label": "2021–2024",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Ultra Prime"
              },
              {
                "id": "1b0bd5200fb917cb",
                "label": "FunPlus Phoenix",
                "short": "FPX",
                "region": "China",
                "seasons": {
                  "first": 2023,
                  "last": 2023,
                  "label": "2023",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "FunPlus Phoenix"
              },
              {
                "id": "925c5ca842da683e",
                "label": "eStar",
                "short": "ES",
                "region": "China",
                "seasons": {
                  "first": 2021,
                  "last": 2021,
                  "label": "2021",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "eStar"
              },
              {
                "id": "d93f7fa433dd64d7",
                "label": "Oh My God",
                "short": "OMG",
                "region": "China",
                "seasons": {
                  "first": 2020,
                  "last": 2020,
                  "label": "2020",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Oh My God"
              }
            ],
            "teams_total": 5,
            "teams_shown": 4,
            "media": {
              "kind": "player",
              "key": null
            },
            "tooltip": "H4cker"
          },
          {
            "kind": "player",
            "label": "Weiwei",
            "id": "f687633b4592f010",
            "role": {
              "id": "jungle",
              "label": "JUNGLE",
              "tooltip": "Jungle"
            },
            "seasons": {
              "first": 2019,
              "last": 2025,
              "label": "2019–2025",
              "tooltip": "Seasons in this scope"
            },
            "teams": [
              {
                "id": "cf135046cf0b882a",
                "label": "LNG Esports",
                "short": "LNG",
                "region": "China",
                "seasons": {
                  "first": 2024,
                  "last": 2025,
                  "label": "2024–2025",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "LNG Esports"
              },
              {
                "id": "6885a45623ba6fc5",
                "label": "Weibo Gaming",
                "short": "WBG",
                "region": "China",
                "seasons": {
                  "first": 2023,
                  "last": 2023,
                  "label": "2023",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Weibo Gaming"
              },
              {
                "id": "11d0df77c159dca0",
                "label": "Bilibili Gaming",
                "short": "BLG",
                "region": "China",
                "seasons": {
                  "first": 2021,
                  "last": 2022,
                  "label": "2021–2022",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Bilibili Gaming"
              },
              {
                "id": "e108c6e266e4d4db",
                "label": "Victory Five",
                "short": "V5",
                "region": "China",
                "seasons": {
                  "first": 2020,
                  "last": 2021,
                  "label": "2020–2021",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Victory Five"
              }
            ],
            "teams_total": 5,
            "teams_shown": 4,
            "media": {
              "kind": "player",
              "key": null
            },
            "tooltip": "Weiwei"
          }
        ]
      }
    },
    "result": {
      "is_correct": false,
      "selected_answer": "H4cker",
      "correct_answer": "Weiwei",
      "explanation": "Weiwei has 25% win rate on Udyr versus H4cker's 7%, in LPL (authority revision 2 / 1).",
      "reveal": {
        "correct_candidate": "Weiwei",
        "metric": "win_rate",
        "shape": "champion_pairwise",
        "values": {
          "Weiwei": 0.25,
          "H4cker": 0.07142857142857142
        },
        "anchor_type": "champion_scope",
        "anchor": "Udyr|Tencent LoL Pro League",
        "scope_label": "Udyr in LPL",
        "authority_revision": null,
        "authority_revisions": {
          "Weiwei": 2,
          "H4cker": 1
        },
        "metric_definition_version": "player_champion_v1",
        "explanation": "Weiwei has 25% win rate on Udyr versus H4cker's 7%, in LPL (authority revision 2 / 1)."
      },
      "evidence": {
        "metric": {
          "id": "win_rate",
          "label": "WIN RATE",
          "kind": "rate",
          "tooltip": "Share of games won in this scope"
        },
        "form": "pairwise",
        "scope_label": "Udyr in LPL",
        "correct_label": "Weiwei",
        "subjects": [
          {
            "label": "H4cker",
            "games": 14,
            "wins": 1,
            "losses": 13,
            "win_rate": 0.07142857142857142,
            "display": "7.1%"
          },
          {
            "label": "Weiwei",
            "games": 12,
            "wins": 3,
            "losses": 9,
            "win_rate": 0.25,
            "display": "25.0%"
          }
        ],
        "authority": {
          "revision": null,
          "revisions": {
            "Weiwei": 2,
            "H4cker": 1
          },
          "metric_definition_version": "player_champion_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "pro_play": {
    "question": {
      "index": 2,
      "number": 3,
      "total": 10,
      "topic": "Player",
      "question_id": "e417d42524946fc8",
      "question_text": "Which of these champions does Peanut have the most pro games on?",
      "choices": [
        "Lee Sin",
        "Sejuani",
        "Vi",
        "Nidalee"
      ],
      "presentation": {
        "shape": "player_ranking",
        "player_display": "Peanut",
        "candidates": [
          "Lee Sin",
          "Sejuani",
          "Vi",
          "Nidalee"
        ],
        "champion_key": null,
        "metric": "games_played",
        "scope_label": "Peanut's pro career"
      },
      "context": {
        "version": 1,
        "relationship": {
          "id": "player_champion",
          "label": "Player → Champion",
          "anchor_entity": "player",
          "subject_entity": "champion"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "all_pro_play",
            "type": "pro_play",
            "label": "ALL PRO PLAY",
            "tooltip": "Every competition Mogzy counts as pro play",
            "priority": 10
          },
          {
            "id": "all_time",
            "type": "all_time",
            "label": "ALL TIME",
            "tooltip": "Every season available in this scope",
            "priority": 90
          }
        ],
        "metric": {
          "id": "games_played",
          "label": "GAMES",
          "kind": "count",
          "tooltip": "Games played on this champion in this scope"
        },
        "anchor": {
          "kind": "player",
          "label": "Peanut",
          "id": "f0707bcd967f31cf",
          "role": {
            "id": "jungle",
            "label": "JUNGLE",
            "tooltip": "Jungle"
          },
          "seasons": {
            "first": 2015,
            "last": 2025,
            "label": "2015–2025",
            "tooltip": "Seasons in this scope"
          },
          "teams": [
            {
              "id": "cb0d5d36c19b22ef",
              "label": "Hanwha Life Esports",
              "short": "HLE",
              "region": "Korea",
              "seasons": {
                "first": 2024,
                "last": 2025,
                "label": "2024–2025",
                "tooltip": "Seasons in this scope"
              },
              "media": {
                "kind": "team",
                "key": null
              },
              "tooltip": "Hanwha Life Esports"
            },
            {
              "id": "e017aedf573470ce",
              "label": "Gen.G",
              "short": "GEN",
              "region": "Korea",
              "seasons": {
                "first": 2019,
                "last": 2023,
                "label": "2019–2023",
                "tooltip": "Seasons in this scope"
              },
              "media": {
                "kind": "team",
                "key": null
              },
              "tooltip": "Gen.G"
            },
            {
              "id": "81650718692c9ca3",
              "label": "Royal Never Give Up",
              "short": "RNG",
              "region": "China",
              "seasons": {
                "first": 2022,
                "last": 2022,
                "label": "2022",
                "tooltip": "Seasons in this scope"
              },
              "media": {
                "kind": "team",
                "key": null
              },
              "tooltip": "Royal Never Give Up"
            },
            {
              "id": "12339fc8609a9cb0",
              "label": "Nongshim RedForce",
              "short": "NS",
              "region": "Korea",
              "seasons": {
                "first": 2021,
                "last": 2021,
                "label": "2021",
                "tooltip": "Seasons in this scope"
              },
              "media": {
                "kind": "team",
                "key": null
              },
              "tooltip": "Nongshim RedForce"
            }
          ],
          "teams_total": 11,
          "teams_shown": 4,
          "media": {
            "kind": "player",
            "key": null
          },
          "tooltip": "Peanut"
        },
        "subjects": [
          {
            "kind": "champion",
            "label": "Lee Sin",
            "id": "Lee Sin",
            "media": {
              "kind": "champion",
              "key": "Lee Sin"
            },
            "tooltip": "Lee Sin"
          },
          {
            "kind": "champion",
            "label": "Sejuani",
            "id": "Sejuani",
            "media": {
              "kind": "champion",
              "key": "Sejuani"
            },
            "tooltip": "Sejuani"
          },
          {
            "kind": "champion",
            "label": "Vi",
            "id": "Vi",
            "media": {
              "kind": "champion",
              "key": "Vi"
            },
            "tooltip": "Vi"
          },
          {
            "kind": "champion",
            "label": "Nidalee",
            "id": "Nidalee",
            "media": {
              "kind": "champion",
              "key": "Nidalee"
            },
            "tooltip": "Nidalee"
          }
        ]
      }
    },
    "result": {
      "is_correct": false,
      "selected_answer": "Lee Sin",
      "correct_answer": "Sejuani",
      "explanation": "Peanut leads with 113 pro games on Sejuani (authority revision 2).",
      "reveal": {
        "correct_candidate": "Sejuani",
        "metric": "games_played",
        "shape": "player_ranking",
        "values": {
          "Sejuani": 113,
          "Lee Sin": 90,
          "Nidalee": 68,
          "Vi": 68
        },
        "anchor_type": "player_scope",
        "anchor": "Peanut|career|MAJOR_PRO",
        "scope_label": "Peanut's pro career",
        "authority_revision": 2,
        "authority_revisions": null,
        "metric_definition_version": "player_champion_v1",
        "explanation": "Peanut leads with 113 pro games on Sejuani (authority revision 2)."
      },
      "evidence": {
        "metric": {
          "id": "games_played",
          "label": "GAMES",
          "kind": "count",
          "tooltip": "Games played on this champion in this scope"
        },
        "form": "ranking",
        "scope_label": "Peanut's pro career",
        "correct_label": "Sejuani",
        "subjects": [
          {
            "label": "Lee Sin",
            "games": 90,
            "wins": 51,
            "display": "90"
          },
          {
            "label": "Sejuani",
            "games": 113,
            "wins": 77,
            "display": "113"
          },
          {
            "label": "Vi",
            "games": 68,
            "wins": 50,
            "display": "68"
          },
          {
            "label": "Nidalee",
            "games": 68,
            "wins": 43,
            "display": "68"
          }
        ],
        "authority": {
          "revision": 2,
          "revisions": null,
          "metric_definition_version": "player_champion_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "nuguri_clear": {
    "question": {
      "index": 0,
      "number": 1,
      "total": 10,
      "topic": "Player",
      "question_id": "nuguri_clear",
      "question_text": "In LCK, who has the higher win rate on Kennen: Nuguri or Clear?",
      "choices": [
        "Nuguri",
        "Clear"
      ],
      "presentation": {},
      "context": {
        "version": 1,
        "relationship": {
          "id": "champion_player",
          "label": "Champion → Player",
          "anchor_entity": "champion",
          "subject_entity": "player"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "LoL Champions Korea",
            "type": "league",
            "label": "LCK",
            "tooltip": "LoL Champions Korea",
            "priority": 10
          },
          {
            "id": "all_time",
            "type": "all_time",
            "label": "ALL TIME",
            "tooltip": "Every season available in this scope",
            "priority": 90
          }
        ],
        "metric": {
          "id": "win_rate",
          "label": "WIN RATE",
          "kind": "rate",
          "tooltip": "Share of games won in this scope"
        },
        "anchor": {
          "kind": "champion",
          "label": "Kennen",
          "id": "Kennen",
          "media": {
            "kind": "champion",
            "key": "Kennen"
          },
          "tooltip": "Kennen"
        },
        "subjects": [
          {
            "kind": "player",
            "label": "Nuguri",
            "id": "22251ba86e0c9674",
            "role": {
              "id": "top",
              "label": "TOP",
              "tooltip": "Top lane"
            },
            "seasons": {
              "first": 2018,
              "last": 2022,
              "label": "2018–2022",
              "tooltip": "Seasons in this scope"
            },
            "teams": [
              {
                "id": "cacb99fa50f8de13",
                "label": "Dplus Kia",
                "short": "DK",
                "region": "Korea",
                "seasons": {
                  "first": 2018,
                  "last": 2022,
                  "label": "2018–2022",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Dplus Kia"
              }
            ],
            "teams_total": 1,
            "teams_shown": 1,
            "media": {
              "kind": "player",
              "key": null
            },
            "tooltip": "Nuguri"
          },
          {
            "kind": "player",
            "label": "Clear",
            "id": "62dd9f0eeeeb7b09",
            "role": {
              "id": "top",
              "label": "TOP",
              "tooltip": "Top lane"
            },
            "seasons": {
              "first": 2022,
              "last": 2026,
              "label": "2022–2026",
              "tooltip": "Seasons in this scope"
            },
            "teams": [
              {
                "id": "24f50bb6d01843aa",
                "label": "BNK FEARX",
                "short": "BFX",
                "region": "Korea",
                "seasons": {
                  "first": 2024,
                  "last": 2026,
                  "label": "2024–2026",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "BNK FEARX"
              },
              {
                "id": "71a38a27b80a5b09",
                "label": "Liiv SANDBOX",
                "short": "LSB",
                "region": "Korea",
                "seasons": {
                  "first": 2023,
                  "last": 2023,
                  "label": "2023",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Liiv SANDBOX"
              },
              {
                "id": "65e9e3f46614f28c",
                "label": "Kiwoom DRX",
                "short": "KRX",
                "region": "Korea",
                "seasons": {
                  "first": 2022,
                  "last": 2022,
                  "label": "2022",
                  "tooltip": "Seasons in this scope"
                },
                "media": {
                  "kind": "team",
                  "key": null
                },
                "tooltip": "Kiwoom DRX"
              }
            ],
            "teams_total": 3,
            "teams_shown": 3,
            "media": {
              "kind": "player",
              "key": null
            },
            "tooltip": "Clear"
          }
        ]
      }
    },
    "result": {
      "is_correct": true,
      "selected_answer": "Nuguri",
      "correct_answer": "Nuguri",
      "explanation": "Nuguri has 75% win rate on Kennen versus Clear's 60%, in LCK (authority revision 1 / 1).",
      "reveal": {},
      "evidence": {
        "metric": {
          "id": "win_rate",
          "label": "WIN RATE",
          "kind": "rate",
          "tooltip": "Share of games won in this scope"
        },
        "form": "pairwise",
        "scope_label": "Kennen in LCK",
        "correct_label": "Nuguri",
        "subjects": [
          {
            "label": "Nuguri",
            "games": 12,
            "wins": 9,
            "losses": 3,
            "win_rate": 0.75,
            "display": "75.0%"
          },
          {
            "label": "Clear",
            "games": 10,
            "wins": 6,
            "losses": 4,
            "win_rate": 0.6,
            "display": "60.0%"
          }
        ],
        "authority": {
          "revision": null,
          "revisions": {
            "Nuguri": 1,
            "Clear": 1
          },
          "metric_definition_version": "player_champion_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  },
  "t1_lineage": {
    "question": {
      "index": 0,
      "number": 1,
      "total": 10,
      "topic": "Team",
      "question_id": "t1_lineage",
      "question_text": "In LoL Champions Korea, which of these teams has the most games played on Gragas?",
      "choices": [
        "T1",
        "KT Rolster",
        "DN SOOPers",
        "SK Telecom T1"
      ],
      "presentation": {},
      "context": {
        "version": 1,
        "relationship": {
          "id": "champion_team",
          "label": "Champion → Team",
          "anchor_entity": "champion",
          "subject_entity": "team"
        },
        "editorial_tags": [],
        "scope_tags": [
          {
            "id": "LoL Champions Korea",
            "type": "league",
            "label": "LCK",
            "tooltip": "LoL Champions Korea",
            "priority": 10
          },
          {
            "id": "all_time",
            "type": "all_time",
            "label": "ALL TIME",
            "tooltip": "Every season available in this scope",
            "priority": 90
          }
        ],
        "metric": {
          "id": "games_played",
          "label": "GAMES",
          "kind": "count",
          "tooltip": "Games played on this champion in this scope"
        },
        "anchor": {
          "kind": "champion",
          "label": "Gragas",
          "id": "Gragas",
          "media": {
            "kind": "champion",
            "key": "Gragas"
          },
          "tooltip": "Gragas"
        },
        "subjects": [
          {
            "kind": "team",
            "label": "T1",
            "id": "bd0b428b35062334",
            "short": "T1",
            "region": "Korea",
            "seasons": {
              "first": 2020,
              "last": 2026,
              "label": "2020–2026",
              "tooltip": "Seasons in this scope"
            },
            "leagues": [
              {
                "id": "LoL Champions Korea",
                "label": "LCK",
                "media": {
                  "kind": "league",
                  "key": null
                },
                "tooltip": "LoL Champions Korea"
              }
            ],
            "leagues_total": 1,
            "leagues_shown": 1,
            "media": {
              "kind": "team",
              "key": null
            },
            "tooltip": "T1"
          },
          {
            "kind": "team",
            "label": "KT Rolster",
            "id": "ec366ce2aa129f7c",
            "short": "KT",
            "region": "Korea",
            "seasons": {
              "first": 2016,
              "last": 2026,
              "label": "2016–2026",
              "tooltip": "Seasons in this scope"
            },
            "leagues": [
              {
                "id": "LoL Champions Korea",
                "label": "LCK",
                "media": {
                  "kind": "league",
                  "key": null
                },
                "tooltip": "LoL Champions Korea"
              }
            ],
            "leagues_total": 1,
            "leagues_shown": 1,
            "media": {
              "kind": "team",
              "key": null
            },
            "tooltip": "KT Rolster"
          },
          {
            "kind": "team",
            "label": "DN SOOPers",
            "id": "c99cb44c253fabd8",
            "short": "DNS",
            "region": "Korea",
            "seasons": {
              "first": 2016,
              "last": 2026,
              "label": "2016–2026",
              "tooltip": "Seasons in this scope"
            },
            "leagues": [
              {
                "id": "LoL Champions Korea",
                "label": "LCK",
                "media": {
                  "kind": "league",
                  "key": null
                },
                "tooltip": "LoL Champions Korea"
              }
            ],
            "leagues_total": 1,
            "leagues_shown": 1,
            "media": {
              "kind": "team",
              "key": null
            },
            "tooltip": "DN SOOPers"
          },
          {
            "kind": "team",
            "label": "SK Telecom T1",
            "id": "32d5b7e408e54d69",
            "short": "SKT",
            "region": "Korea",
            "seasons": {
              "first": 2016,
              "last": 2019,
              "label": "2016–2019",
              "tooltip": "Seasons in this scope"
            },
            "leagues": [
              {
                "id": "LoL Champions Korea",
                "label": "LCK",
                "media": {
                  "kind": "league",
                  "key": null
                },
                "tooltip": "LoL Champions Korea"
              }
            ],
            "leagues_total": 1,
            "leagues_shown": 1,
            "media": {
              "kind": "team",
              "key": null
            },
            "tooltip": "SK Telecom T1"
          }
        ]
      }
    },
    "result": {
      "is_correct": true,
      "selected_answer": "DN SOOPers",
      "correct_answer": "DN SOOPers",
      "explanation": "DN SOOPers leads with 101 games played on Gragas, in LoL Champions Korea (authority revision 1).",
      "reveal": {},
      "evidence": {
        "metric": {
          "id": "games_played",
          "label": "GAMES",
          "kind": "count",
          "tooltip": "Games played on this champion in this scope"
        },
        "form": "ranking",
        "scope_label": "Gragas in LoL Champions Korea",
        "correct_label": "DN SOOPers",
        "subjects": [
          {
            "label": "T1",
            "games": 64,
            "wins": 48,
            "display": "64"
          },
          {
            "label": "KT Rolster",
            "games": 84,
            "wins": 47,
            "display": "84"
          },
          {
            "label": "DN SOOPers",
            "games": 101,
            "wins": 51,
            "display": "101"
          },
          {
            "label": "SK Telecom T1",
            "games": 51,
            "wins": 30,
            "display": "51"
          }
        ],
        "authority": {
          "revision": null,
          "revisions": {
            "DN SOOPers": 1,
            "KT Rolster": 1,
            "T1": 1,
            "SK Telecom T1": 1
          },
          "metric_definition_version": "team_champion_v1",
          "policy_version": "pro_default_v1"
        }
      }
    }
  }
} as unknown as Record<string, ProPlaySample>;

export default PRO_PLAY_SAMPLES;
