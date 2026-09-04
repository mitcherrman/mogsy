// Fixtures captured verbatim from the live study-table API
// (GET /api/mechanics/tables and /study/{table_id}) at patch 26.15.
//
// These are TRANSPORT SAMPLES, not a second source of truth: they exist so
// the renderer's tests exercise every real payload shape (an explicit label
// column, sparse cells, prose columns, percent units, section bands, long
// numeric tables). Long tables are truncated to their first few rows PER
// SECTION so every band survives; no value was edited, and no row was
// synthesised. Nothing under src/ imports this module — only tests do.

import type { StudyTable, TablesIndex } from "./api";

export const INDEX_FIXTURE: TablesIndex = {
  "patch": "26.15",
  "categories": [
    {
      "category": "base_systems",
      "study_tables": [
        {
          "table_id": "base_systems.study.fountain",
          "title": "The fountain",
          "subtitle": "What your own fountain gives back, and what the enemy one takes",
          "row_count": 6
        },
        {
          "table_id": "base_systems.study.homeguard",
          "title": "Homeguard",
          "subtitle": "The movement speed the fountain gives you, and what takes it away",
          "row_count": 6
        },
        {
          "table_id": "base_systems.study.death_timers",
          "title": "Death timers",
          "subtitle": "How long you stay dead, and what makes it longer",
          "row_count": 22
        }
      ]
    },
    {
      "category": "jungle_objectives",
      "study_tables": [
        {
          "table_id": "jungle_objectives.study.timers",
          "title": "Jungle timers",
          "subtitle": "When every camp and objective first spawns, and how long it takes to come back",
          "row_count": 11
        }
      ]
    },
    {
      "category": "minion_behavior",
      "study_tables": [
        {
          "table_id": "minion_behavior.study.aggro",
          "title": "What makes minions attack you",
          "subtitle": "The current aggro triggers, and the one that was removed",
          "row_count": 4
        },
        {
          "table_id": "minion_behavior.study.pushing",
          "title": "Minion Pushing",
          "subtitle": "The catch-up buff a team's minions get for being ahead in average champion level",
          "row_count": 8
        },
        {
          "table_id": "minion_behavior.study.pushing_examples",
          "title": "Minion Pushing bonus damage",
          "subtitle": "Bonus damage your minions deal to enemy minions, as a percentage",
          "row_count": 3
        }
      ]
    },
    {
      "category": "minion_stats",
      "study_tables": [
        {
          "table_id": "minion_stats.study.base",
          "title": "Minion base stats",
          "subtitle": "What each lane minion is worth and how tough it is when the game starts",
          "row_count": 8
        },
        {
          "table_id": "minion_stats.study.scaling",
          "title": "How often minion stats increase",
          "subtitle": "Minions get stronger on a game-time clock, not per wave",
          "row_count": 11
        },
        {
          "table_id": "minion_stats.study.defenses",
          "title": "Minion armor and magic resist",
          "subtitle": "What minions resist, and what they do not",
          "row_count": 4
        }
      ]
    },
    {
      "category": "minion_waves",
      "study_tables": [
        {
          "table_id": "minion_waves.study.schedule",
          "title": "Wave timing and cannon cadence",
          "subtitle": "When waves start, and how often a cannon minion shows up",
          "row_count": 9
        },
        {
          "table_id": "minion_waves.study.composition",
          "title": "What is in a minion wave",
          "subtitle": "Melee, caster, cannon and super minions by game time and inhibitor state",
          "row_count": 18
        },
        {
          "table_id": "minion_waves.study.wave_times",
          "title": "When every wave spawns",
          "subtitle": "Exact spawn times, and the gap from the wave before",
          "row_count": 78
        }
      ]
    },
    {
      "category": "structures",
      "study_tables": [
        {
          "table_id": "structures.study.stats",
          "title": "Structure stats",
          "subtitle": "How much every turret, inhibitor and the Nexus has, and how hard it hits back",
          "row_count": 6
        },
        {
          "table_id": "structures.study.plates",
          "title": "Turret plates",
          "subtitle": "When plates fall, what they pay, and how outer-turret plate gold decays",
          "row_count": 13
        },
        {
          "table_id": "structures.study.turret_combat",
          "title": "Turret combat rules",
          "subtitle": "What changes the damage you deal to a turret, and the damage it deals to you",
          "row_count": 13
        },
        {
          "table_id": "structures.study.base",
          "title": "Inhibitors and the Nexus",
          "subtitle": "What has to fall before what, and what comes back",
          "row_count": 10
        },
        {
          "table_id": "structures.study.overgrowth_bulwark",
          "title": "Crystalline Overgrowth and Bulwark",
          "subtitle": "The turret's two comeback mechanics",
          "row_count": 13
        }
      ]
    },
    {
      "category": "takedown_economy",
      "study_tables": [
        {
          "table_id": "takedown_economy.study.kill_gold",
          "title": "Kill and assist gold by level",
          "subtitle": "What a takedown is worth, and how the assist gold divides",
          "row_count": 18
        },
        {
          "table_id": "takedown_economy.study.bounty",
          "title": "Bounties, shutdowns and comebacks",
          "subtitle": "What a kill is worth when the victim is far ahead or far behind",
          "row_count": 13
        }
      ]
    },
    {
      "category": "wave_economy",
      "study_tables": [
        {
          "table_id": "wave_economy.study.xp_by_wave",
          "title": "Experience from minion waves",
          "subtitle": "What each wave is worth, and the level it puts you on",
          "row_count": 54
        },
        {
          "table_id": "wave_economy.study.level_breakpoints",
          "title": "Which wave gives you which level",
          "subtitle": "When each level arrives, from minion experience alone",
          "row_count": 18
        },
        {
          "table_id": "wave_economy.study.gold_by_wave",
          "title": "Gold from minion waves",
          "subtitle": "What each wave pays, and the running total with perfect CS",
          "row_count": 27
        }
      ]
    }
  ]
};

export const FOUNTAIN: StudyTable = {
  "table_id": "base_systems.study.fountain",
  "category": "base_systems",
  "title": "The fountain",
  "subtitle": "What your own fountain gives back, and what the enemy one takes",
  "patch": "26.15",
  "verified_through": "26.15",
  "source_table_ids": [
    "base_systems.fountain"
  ],
  "columns": [
    {
      "key": "detail",
      "label": "What happens",
      "unit": "",
      "kind": "text"
    }
  ],
  "sections": [
    {
      "key": "your_fountain",
      "label": "Standing in your own fountain",
      "note": ""
    },
    {
      "key": "enemy_fountain",
      "label": "Standing in the enemy fountain",
      "note": ""
    }
  ],
  "rows": [
    {
      "row_id": "health",
      "label": "Health you recover",
      "section": "your_fountain",
      "values": {
        "detail": "8% of your maximum health per second (2% every 0.25s)"
      },
      "fact_ids": [
        "base_systems.fountain:health_regeneration"
      ]
    },
    {
      "row_id": "mana",
      "label": "Mana you recover",
      "section": "your_fountain",
      "values": {
        "detail": "10% of your maximum mana per second (2.5% every 0.25s)"
      },
      "fact_ids": [
        "base_systems.fountain:mana_regeneration"
      ]
    },
    {
      "row_id": "homeguard",
      "label": "With Homeguard active",
      "section": "your_fountain",
      "values": {
        "detail": "A further 16% of your missing health and mana per second (8% every 0.5s), on top of the rates above"
      },
      "fact_ids": [
        "base_systems.fountain:homeguard_regeneration"
      ]
    },
    {
      "row_id": "obelisk_damage",
      "label": "Damage it deals",
      "section": "enemy_fountain",
      "values": {
        "detail": "2000 raw damage per second \u2014 1000 damage, 2 times a second"
      },
      "fact_ids": [
        "base_systems.fountain:enemy_obelisk"
      ]
    },
    {
      "row_id": "obelisk_bypass",
      "label": "What stops it",
      "section": "enemy_fountain",
      "values": {
        "detail": "Nothing you can build or cast: it goes through shields, invulnerability and undying effects. Only true untargetability avoids it."
      },
      "fact_ids": [
        "base_systems.fountain:enemy_obelisk"
      ]
    },
    {
      "row_id": "obelisk_range",
      "label": "How far it reaches",
      "section": "enemy_fountain",
      "values": {
        "detail": "1250"
      },
      "fact_ids": [
        "base_systems.fountain:enemy_obelisk"
      ]
    }
  ],
  "notes": [
    "Energy restoration is not published: the game's wording for it cannot be read unambiguously."
  ]
};

export const MINION_BASE_STATS: StudyTable = {
  "table_id": "minion_stats.study.base",
  "category": "minion_stats",
  "title": "Minion base stats",
  "subtitle": "What each lane minion is worth and how tough it is when the game starts",
  "patch": "26.15",
  "verified_through": "26.15",
  "source_table_ids": [
    "minion_stats.base"
  ],
  "columns": [
    {
      "key": "stat",
      "label": "Stat",
      "unit": "",
      "kind": "text"
    },
    {
      "key": "melee",
      "label": "Melee minion",
      "unit": "",
      "kind": "number"
    },
    {
      "key": "caster",
      "label": "Caster minion",
      "unit": "",
      "kind": "number"
    },
    {
      "key": "cannon",
      "label": "Cannon minion",
      "unit": "",
      "kind": "number"
    },
    {
      "key": "super",
      "label": "Super minion",
      "unit": "",
      "kind": "number"
    },
    {
      "key": "all_minions",
      "label": "Every lane minion",
      "unit": "",
      "kind": "number"
    },
    {
      "key": "highest",
      "label": "Highest",
      "unit": "",
      "kind": "text"
    }
  ],
  "sections": [
    {
      "key": "per_type",
      "label": "At the start of the game",
      "note": ""
    },
    {
      "key": "movement_speed",
      "label": "Movement speed over time",
      "note": "Identical for every lane minion, before any movement-speed cap."
    }
  ],
  "rows": [
    {
      "row_id": "start_gold",
      "label": "Gold value",
      "section": "per_type",
      "values": {
        "melee": "20",
        "caster": "14",
        "cannon": "50",
        "super": "50",
        "highest": "Cannon / Super"
      },
      "fact_ids": [
        "minion_stats.base:melee/gold",
        "minion_stats.base:caster/gold",
        "minion_stats.base:cannon/gold",
        "minion_stats.base:super/gold",
        "minion_stats.base:comparative/highest_gold"
      ]
    },
    {
      "row_id": "start_health",
      "label": "Health",
      "section": "per_type",
      "values": {
        "melee": "430",
        "caster": "275",
        "cannon": "750",
        "super": "1500",
        "highest": "Super"
      },
      "fact_ids": [
        "minion_stats.base:melee/health",
        "minion_stats.base:caster/health",
        "minion_stats.base:cannon/health",
        "minion_stats.base:super/health",
        "minion_stats.base:comparative/highest_health"
      ]
    },
    {
      "row_id": "start_attack_damage",
      "label": "Attack damage",
      "section": "per_type",
      "values": {
        "melee": "11",
        "caster": "19.5",
        "cannon": "39",
        "super": "180"
      },
      "fact_ids": [
        "minion_stats.base:melee/attack_damage",
        "minion_stats.base:caster/attack_damage",
        "minion_stats.base:cannon/attack_damage",
        "minion_stats.base:super/attack_damage"
      ]
    },
    {
      "row_id": "movement_speed_0",
      "label": "At the start of the game",
      "section": "movement_speed",
      "values": {
        "all_minions": "350"
      },
      "fact_ids": [
        "minion_stats.base:movement_speed/at_start"
      ]
    },
    {
      "row_id": "movement_speed_660",
      "label": "From 11:00",
      "section": "movement_speed",
      "values": {
        "all_minions": "375"
      },
      "fact_ids": [
        "minion_stats.base:movement_speed/from_11"
      ]
    },
    {
      "row_id": "movement_speed_960",
      "label": "From 16:00",
      "section": "movement_speed",
      "values": {
        "all_minions": "400"
      },
      "fact_ids": [
        "minion_stats.base:movement_speed/from_16"
      ]
    }
  ],
  "notes": [
    "These are the values a minion spawns with; health, attack damage and some gold values rise as the game goes on.",
    "No maximum health is published: the game does not state one."
  ]
};

export const XP_BY_WAVE: StudyTable = {
  "table_id": "wave_economy.study.xp_by_wave",
  "category": "wave_economy",
  "title": "Experience from minion waves",
  "subtitle": "What each wave is worth, and the level it puts you on",
  "patch": "26.15",
  "verified_through": "26.15",
  "source_table_ids": [
    "wave_economy.xp_by_wave",
    "wave_economy.gold_by_wave"
  ],
  "columns": [
    {
      "key": "spawn_time",
      "label": "Spawns at",
      "unit": "",
      "kind": "time"
    },
    {
      "key": "composition",
      "label": "What spawns",
      "unit": "",
      "kind": "text"
    },
    {
      "key": "wave_experience",
      "label": "XP this wave",
      "unit": "experience",
      "kind": "number"
    },
    {
      "key": "cumulative_experience_after",
      "label": "Total XP",
      "unit": "experience",
      "kind": "number"
    },
    {
      "key": "champion_level_after",
      "label": "Level after the wave",
      "unit": "",
      "kind": "number"
    }
  ],
  "sections": [
    {
      "key": "solo",
      "label": "Solo lane (1 champion)",
      "note": "Every minion killed, no experience missed."
    },
    {
      "key": "duo",
      "label": "Shared lane (2 champions)",
      "note": "Every minion killed, no experience missed."
    }
  ],
  "rows": [
    {
      "row_id": "solo_wave_1",
      "label": "Wave 1",
      "section": "solo",
      "values": {
        "spawn_time": "0:30",
        "composition": "3 melee + 3 caster",
        "wave_experience": "279",
        "cumulative_experience_after": "279",
        "champion_level_after": 1
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:solo/wave/1"
      ]
    },
    {
      "row_id": "solo_wave_2",
      "label": "Wave 2",
      "section": "solo",
      "values": {
        "spawn_time": "1:00",
        "composition": "3 melee + 3 caster",
        "wave_experience": "279",
        "cumulative_experience_after": "558",
        "champion_level_after": 2
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:solo/wave/2"
      ]
    },
    {
      "row_id": "solo_wave_3",
      "label": "Wave 3",
      "section": "solo",
      "values": {
        "spawn_time": "1:30",
        "composition": "3 melee + 3 caster + 1 cannon",
        "wave_experience": "354",
        "cumulative_experience_after": "912",
        "champion_level_after": 3
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:solo/wave/3"
      ]
    },
    {
      "row_id": "solo_wave_4",
      "label": "Wave 4",
      "section": "solo",
      "values": {
        "spawn_time": "2:00",
        "composition": "3 melee + 3 caster",
        "wave_experience": "279",
        "cumulative_experience_after": "1191",
        "champion_level_after": 4
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:solo/wave/4"
      ]
    },
    {
      "row_id": "solo_wave_5",
      "label": "Wave 5",
      "section": "solo",
      "values": {
        "spawn_time": "2:30",
        "composition": "3 melee + 3 caster",
        "wave_experience": "279",
        "cumulative_experience_after": "1470",
        "champion_level_after": 4
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:solo/wave/5"
      ]
    },
    {
      "row_id": "solo_wave_6",
      "label": "Wave 6",
      "section": "solo",
      "values": {
        "spawn_time": "3:00",
        "composition": "3 melee + 3 caster + 1 cannon",
        "wave_experience": "354",
        "cumulative_experience_after": "1824",
        "champion_level_after": 5
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:solo/wave/6"
      ]
    },
    {
      "row_id": "solo_wave_7",
      "label": "Wave 7",
      "section": "solo",
      "values": {
        "spawn_time": "3:30",
        "composition": "3 melee + 3 caster",
        "wave_experience": "279",
        "cumulative_experience_after": "2103",
        "champion_level_after": 5
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:solo/wave/7"
      ]
    },
    {
      "row_id": "solo_wave_8",
      "label": "Wave 8",
      "section": "solo",
      "values": {
        "spawn_time": "4:00",
        "composition": "3 melee + 3 caster",
        "wave_experience": "279",
        "cumulative_experience_after": "2382",
        "champion_level_after": 5
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:solo/wave/8"
      ]
    },
    {
      "row_id": "solo_wave_9",
      "label": "Wave 9",
      "section": "solo",
      "values": {
        "spawn_time": "4:30",
        "composition": "3 melee + 3 caster + 1 cannon",
        "wave_experience": "354",
        "cumulative_experience_after": "2736",
        "champion_level_after": 6
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:solo/wave/9"
      ]
    },
    {
      "row_id": "solo_wave_10",
      "label": "Wave 10",
      "section": "solo",
      "values": {
        "spawn_time": "5:00",
        "composition": "3 melee + 3 caster",
        "wave_experience": "279",
        "cumulative_experience_after": "3015",
        "champion_level_after": 6
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:solo/wave/10"
      ]
    },
    {
      "row_id": "duo_wave_1",
      "label": "Wave 1",
      "section": "duo",
      "values": {
        "spawn_time": "0:30",
        "composition": "3 melee + 3 caster",
        "wave_experience": "181.35",
        "cumulative_experience_after": "181.35",
        "champion_level_after": 1
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:duo/wave/1"
      ]
    },
    {
      "row_id": "duo_wave_2",
      "label": "Wave 2",
      "section": "duo",
      "values": {
        "spawn_time": "1:00",
        "composition": "3 melee + 3 caster",
        "wave_experience": "181.35",
        "cumulative_experience_after": "362.7",
        "champion_level_after": 2
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:duo/wave/2"
      ]
    },
    {
      "row_id": "duo_wave_3",
      "label": "Wave 3",
      "section": "duo",
      "values": {
        "spawn_time": "1:30",
        "composition": "3 melee + 3 caster + 1 cannon",
        "wave_experience": "230.1",
        "cumulative_experience_after": "592.8",
        "champion_level_after": 2
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:duo/wave/3"
      ]
    },
    {
      "row_id": "duo_wave_4",
      "label": "Wave 4",
      "section": "duo",
      "values": {
        "spawn_time": "2:00",
        "composition": "3 melee + 3 caster",
        "wave_experience": "181.35",
        "cumulative_experience_after": "774.15",
        "champion_level_after": 3
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:duo/wave/4"
      ]
    },
    {
      "row_id": "duo_wave_5",
      "label": "Wave 5",
      "section": "duo",
      "values": {
        "spawn_time": "2:30",
        "composition": "3 melee + 3 caster",
        "wave_experience": "181.35",
        "cumulative_experience_after": "955.5",
        "champion_level_after": 3
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:duo/wave/5"
      ]
    },
    {
      "row_id": "duo_wave_6",
      "label": "Wave 6",
      "section": "duo",
      "values": {
        "spawn_time": "3:00",
        "composition": "3 melee + 3 caster + 1 cannon",
        "wave_experience": "230.1",
        "cumulative_experience_after": "1185.6",
        "champion_level_after": 4
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:duo/wave/6"
      ]
    },
    {
      "row_id": "duo_wave_7",
      "label": "Wave 7",
      "section": "duo",
      "values": {
        "spawn_time": "3:30",
        "composition": "3 melee + 3 caster",
        "wave_experience": "181.35",
        "cumulative_experience_after": "1366.95",
        "champion_level_after": 4
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:duo/wave/7"
      ]
    },
    {
      "row_id": "duo_wave_8",
      "label": "Wave 8",
      "section": "duo",
      "values": {
        "spawn_time": "4:00",
        "composition": "3 melee + 3 caster",
        "wave_experience": "181.35",
        "cumulative_experience_after": "1548.3",
        "champion_level_after": 4
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:duo/wave/8"
      ]
    },
    {
      "row_id": "duo_wave_9",
      "label": "Wave 9",
      "section": "duo",
      "values": {
        "spawn_time": "4:30",
        "composition": "3 melee + 3 caster + 1 cannon",
        "wave_experience": "230.1",
        "cumulative_experience_after": "1778.4",
        "champion_level_after": 5
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:duo/wave/9"
      ]
    },
    {
      "row_id": "duo_wave_10",
      "label": "Wave 10",
      "section": "duo",
      "values": {
        "spawn_time": "5:00",
        "composition": "3 melee + 3 caster",
        "wave_experience": "181.35",
        "cumulative_experience_after": "1959.75",
        "champion_level_after": 5
      },
      "fact_ids": [
        "wave_economy.xp_by_wave:duo/wave/10"
      ]
    }
  ],
  "notes": [
    "Minion experience only \u2014 no jungle camps, no champion takedowns, no passive experience.",
    "A shared lane splits every minion's experience between both champions, so each of them gets less than a solo laner.",
    "These are the waves before the first wave-composition change."
  ]
};

export const PUSHING_EXAMPLES: StudyTable = {
  "table_id": "minion_behavior.study.pushing_examples",
  "category": "minion_behavior",
  "title": "Minion Pushing bonus damage",
  "subtitle": "Bonus damage your minions deal to enemy minions, as a percentage",
  "patch": "26.15",
  "verified_through": "26.15",
  "source_table_ids": [
    "minion_behavior.pushing_scenarios"
  ],
  "columns": [
    {
      "key": "level_advantage",
      "label": "Average level advantage",
      "unit": "",
      "kind": "text"
    },
    {
      "key": "turrets_0",
      "label": "0 turrets ahead",
      "unit": "percent",
      "kind": "number"
    },
    {
      "key": "turrets_1",
      "label": "1 turret ahead",
      "unit": "percent",
      "kind": "number"
    },
    {
      "key": "turrets_2",
      "label": "2 turrets ahead",
      "unit": "percent",
      "kind": "number"
    },
    {
      "key": "turrets_3",
      "label": "3 turrets ahead",
      "unit": "percent",
      "kind": "number"
    }
  ],
  "sections": [],
  "rows": [
    {
      "row_id": "level_1",
      "label": "1 average level ahead",
      "section": "",
      "values": {
        "turrets_0": "5",
        "turrets_1": "10",
        "turrets_2": "15",
        "turrets_3": "20"
      },
      "fact_ids": [
        "minion_behavior.pushing_scenarios:level1/turret0",
        "minion_behavior.pushing_scenarios:level1/turret1",
        "minion_behavior.pushing_scenarios:level1/turret2",
        "minion_behavior.pushing_scenarios:level1/turret3"
      ]
    },
    {
      "row_id": "level_2",
      "label": "2 average levels ahead",
      "section": "",
      "values": {
        "turrets_0": "10",
        "turrets_1": "20",
        "turrets_2": "30",
        "turrets_3": "40"
      },
      "fact_ids": [
        "minion_behavior.pushing_scenarios:level2/turret0",
        "minion_behavior.pushing_scenarios:level2/turret1",
        "minion_behavior.pushing_scenarios:level2/turret2",
        "minion_behavior.pushing_scenarios:level2/turret3"
      ]
    },
    {
      "row_id": "level_3",
      "label": "3 average levels ahead",
      "section": "",
      "values": {
        "turrets_0": "15",
        "turrets_1": "30",
        "turrets_2": "45",
        "turrets_3": "60"
      },
      "fact_ids": [
        "minion_behavior.pushing_scenarios:level3/turret0",
        "minion_behavior.pushing_scenarios:level3/turret1",
        "minion_behavior.pushing_scenarios:level3/turret2",
        "minion_behavior.pushing_scenarios:level3/turret3"
      ]
    }
  ],
  "notes": [
    "Every cell is the formula applied to that pair, not a separate rule."
  ]
};

export const KILL_GOLD: StudyTable = {
  "table_id": "takedown_economy.study.kill_gold",
  "category": "takedown_economy",
  "title": "Kill and assist gold by level",
  "subtitle": "What a takedown is worth, and how the assist gold divides",
  "patch": "26.15",
  "verified_through": "26.15",
  "source_table_ids": [
    "takedown_economy.facts",
    "takedown_economy.scenarios"
  ],
  "columns": [
    {
      "key": "kill_gold",
      "label": "Kill gold",
      "unit": "gold",
      "kind": "number"
    },
    {
      "key": "first_blood",
      "label": "With First Blood",
      "unit": "gold",
      "kind": "number"
    },
    {
      "key": "assist_pool",
      "label": "Assist pool",
      "unit": "gold",
      "kind": "number"
    },
    {
      "key": "share_2",
      "label": "Each of 2",
      "unit": "gold",
      "kind": "number"
    },
    {
      "key": "share_3",
      "label": "Each of 3",
      "unit": "gold",
      "kind": "number"
    },
    {
      "key": "share_4",
      "label": "Each of 4",
      "unit": "gold",
      "kind": "number"
    },
    {
      "key": "team_total",
      "label": "Team total",
      "unit": "gold",
      "kind": "number"
    }
  ],
  "sections": [],
  "rows": [
    {
      "row_id": "level_1",
      "label": "Level 1",
      "section": "",
      "values": {
        "kill_gold": "300",
        "first_blood": "400",
        "assist_pool": "150",
        "team_total": "450",
        "share_2": "75",
        "share_3": "50",
        "share_4": "38"
      },
      "fact_ids": [
        "takedown_economy.facts:kill_gold/level/1",
        "takedown_economy.scenarios:level/1"
      ]
    },
    {
      "row_id": "level_2",
      "label": "Level 2",
      "section": "",
      "values": {
        "kill_gold": "300",
        "first_blood": "400",
        "assist_pool": "150",
        "team_total": "450",
        "share_2": "75",
        "share_3": "50",
        "share_4": "38"
      },
      "fact_ids": [
        "takedown_economy.facts:kill_gold/level/2",
        "takedown_economy.scenarios:level/2"
      ]
    },
    {
      "row_id": "level_3",
      "label": "Level 3",
      "section": "",
      "values": {
        "kill_gold": "300",
        "first_blood": "400",
        "assist_pool": "150",
        "team_total": "450",
        "share_2": "75",
        "share_3": "50",
        "share_4": "38"
      },
      "fact_ids": [
        "takedown_economy.facts:kill_gold/level/3",
        "takedown_economy.scenarios:level/3"
      ]
    },
    {
      "row_id": "level_4",
      "label": "Level 4",
      "section": "",
      "values": {
        "kill_gold": "300",
        "first_blood": "400",
        "assist_pool": "150",
        "team_total": "450",
        "share_2": "75",
        "share_3": "50",
        "share_4": "38"
      },
      "fact_ids": [
        "takedown_economy.facts:kill_gold/level/4",
        "takedown_economy.scenarios:level/4"
      ]
    }
  ],
  "notes": [
    "The level is the VICTIM's level, not yours.",
    "The assist pool is the same however many champions assist \u2014 the team total does not change with the number of assistors, only how the pool divides.",
    "Individual shares are rounded up to whole gold, so they can sum to slightly more than the pool."
  ]
};

export const DEATH_TIMERS: StudyTable = {
  "table_id": "base_systems.study.death_timers",
  "category": "base_systems",
  "title": "Death timers",
  "subtitle": "How long you stay dead, and what makes it longer",
  "patch": "26.15",
  "verified_through": "26.15",
  "source_table_ids": [
    "base_systems.death_timers"
  ],
  "columns": [
    {
      "key": "detail",
      "label": "What happens",
      "unit": "",
      "kind": "text"
    },
    {
      "key": "seconds",
      "label": "Base Respawn Wait",
      "unit": "seconds",
      "kind": "number"
    }
  ],
  "sections": [
    {
      "key": "rules",
      "label": "The rules",
      "note": ""
    },
    {
      "key": "by_level",
      "label": "Base Respawn Wait by champion level",
      "note": "The level component only. Game-time scaling is added on top from the instant it starts."
    }
  ],
  "rows": [
    {
      "row_id": "level_dependence",
      "label": "Does your level matter",
      "section": "rules",
      "values": {
        "detail": "Yes \u2014 the Base Respawn Wait is a per-level table"
      },
      "fact_ids": [
        "base_systems.death_timers:level_dependence"
      ]
    },
    {
      "row_id": "scaling_start",
      "label": "Game-time scaling starts at",
      "section": "rules",
      "values": {
        "detail": "15:00"
      },
      "fact_ids": [
        "base_systems.death_timers:game_time_scaling"
      ]
    },
    {
      "row_id": "scaling_cap",
      "label": "Most it can add",
      "section": "rules",
      "values": {
        "detail": "50% on top of your Base Respawn Wait"
      },
      "fact_ids": [
        "base_systems.death_timers:game_time_scaling"
      ]
    },
    {
      "row_id": "growth",
      "label": "Do timers get longer later",
      "section": "rules",
      "values": {
        "detail": "Yes"
      },
      "fact_ids": [
        "base_systems.death_timers:growth_with_game_time"
      ]
    },
    {
      "row_id": "level_1",
      "label": "Level 1",
      "section": "by_level",
      "values": {
        "seconds": "10"
      },
      "fact_ids": [
        "base_systems.death_timers:base_respawn_wait/level/1"
      ]
    },
    {
      "row_id": "level_2",
      "label": "Level 2",
      "section": "by_level",
      "values": {
        "seconds": "10"
      },
      "fact_ids": [
        "base_systems.death_timers:base_respawn_wait/level/2"
      ]
    },
    {
      "row_id": "level_3",
      "label": "Level 3",
      "section": "by_level",
      "values": {
        "seconds": "12"
      },
      "fact_ids": [
        "base_systems.death_timers:base_respawn_wait/level/3"
      ]
    },
    {
      "row_id": "level_4",
      "label": "Level 4",
      "section": "by_level",
      "values": {
        "seconds": "12"
      },
      "fact_ids": [
        "base_systems.death_timers:base_respawn_wait/level/4"
      ]
    }
  ],
  "notes": [
    "How much game-time scaling has added at any given moment is not published here."
  ]
};

export const STRUCTURE_STATS: StudyTable = {
  "table_id": "structures.study.stats",
  "category": "structures",
  "title": "Structure stats",
  "subtitle": "How much every turret, inhibitor and the Nexus has, and how hard it hits back",
  "patch": "26.15",
  "verified_through": "26.15",
  "source_table_ids": [
    "structures.facts"
  ],
  "columns": [
    {
      "key": "count",
      "label": "Per team",
      "unit": "",
      "kind": "number"
    },
    {
      "key": "health",
      "label": "Health",
      "unit": "",
      "kind": "number"
    },
    {
      "key": "resists",
      "label": "Armor / MR",
      "unit": "",
      "kind": "text"
    },
    {
      "key": "attack_damage",
      "label": "Attack damage",
      "unit": "",
      "kind": "text"
    },
    {
      "key": "regen",
      "label": "Regen",
      "unit": "",
      "kind": "text"
    },
    {
      "key": "respawn",
      "label": "Respawn",
      "unit": "",
      "kind": "text"
    }
  ],
  "sections": [
    {
      "key": "turrets",
      "label": "Turrets",
      "note": ""
    },
    {
      "key": "buildings",
      "label": "Inhibitor and Nexus",
      "note": ""
    }
  ],
  "rows": [
    {
      "row_id": "turret_outer",
      "label": "Outer turret",
      "section": "turrets",
      "values": {
        "count": 3,
        "health": "9000",
        "resists": "60 / 60 (falls 15 per minute from 11:00)",
        "attack_damage": "182 \u2192 350",
        "regen": "\u2014",
        "respawn": "\u2014"
      },
      "fact_ids": [
        "structures.facts:structure/turret_outer",
        "structures.facts:structure/turret_outer/resist_decay"
      ]
    },
    {
      "row_id": "turret_inner",
      "label": "Inner turret",
      "section": "turrets",
      "values": {
        "count": 3,
        "health": "5000",
        "resists": "60 / 60",
        "attack_damage": "187 \u2192 427",
        "regen": "\u2014",
        "respawn": "\u2014"
      },
      "fact_ids": [
        "structures.facts:structure/turret_inner"
      ]
    },
    {
      "row_id": "turret_inhibitor",
      "label": "Inhibitor turret",
      "section": "turrets",
      "values": {
        "count": 3,
        "health": "4750",
        "resists": "60 / 60",
        "attack_damage": "187 \u2192 427",
        "regen": "3/s",
        "respawn": "\u2014"
      },
      "fact_ids": [
        "structures.facts:structure/turret_inhibitor"
      ]
    },
    {
      "row_id": "turret_nexus",
      "label": "Nexus turret",
      "section": "turrets",
      "values": {
        "count": 2,
        "health": "3500",
        "resists": "60 / 60",
        "attack_damage": "165 \u2192 405",
        "regen": "6/s",
        "respawn": "3 minutes"
      },
      "fact_ids": [
        "structures.facts:structure/turret_nexus"
      ]
    },
    {
      "row_id": "inhibitor",
      "label": "Inhibitor",
      "section": "buildings",
      "values": {
        "count": 3,
        "health": "4000",
        "resists": "20 / 0",
        "attack_damage": "\u2014",
        "regen": "15/s",
        "respawn": "5 minutes"
      },
      "fact_ids": [
        "structures.facts:structure/inhibitor"
      ]
    },
    {
      "row_id": "nexus",
      "label": "Nexus",
      "section": "buildings",
      "values": {
        "count": 1,
        "health": "5500",
        "resists": "20 / 0",
        "attack_damage": "\u2014",
        "regen": "20/s",
        "respawn": "\u2014"
      },
      "fact_ids": [
        "structures.facts:structure/nexus"
      ]
    }
  ],
  "notes": [
    "\u2014 means the column does not apply.",
    "Attack damage is shown as its value at spawn and its maximum."
  ]
};
