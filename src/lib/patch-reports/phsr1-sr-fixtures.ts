// Real production payload excerpts (GET /api/patch-reports/{26.19,26.10}, fetched 2026-10-07).
// Riot rationale prose and historical_context are dropped; every other field is verbatim.
import type { PatchReconciliation, PatchReportCard } from "./api";

export const RECONCILIATION_26_19: PatchReconciliation = {
  "status": "RECONCILED_WITH_HELDS",
  "meaning": "Every change Mogzy is capable of absorbing was applied. Others are held — Mogzy's gameplay data is still on the previous patch for those mechanics.",
  "reconciliation_recorded": true,
  "operation_id": "26.19#1",
  "changes_by_terminal_state": {
    "AUTO_APPLIED": 11,
    "AUTO_APPLIED_REVIEW": 0,
    "HELD_RUNTIME_WORK": 24,
    "HELD_AUTHORITY": 7,
    "FAILED": 0,
    "NO_MOGZY_CONSUMER": 173
  },
  "gameplay_data_may_be_stale": true
};

/** 26.19 has 214 report lines; the reconciliation counts 215 items (Vi base AD splits into base + growth). */
export const REPORT_26_19_LINE_COUNT = 214;

export const SR_DRAVEN: PatchReportCard = {
  "id": 3235,
  "entity_type": "champion",
  "entity_name": "Draven",
  "entity_slug": "Draven",
  "section_id": "patch-champions",
  "section_title": "Champions",
  "official_image_url": "https://am-a.akamaihd.net/image?f=https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Draven.png",
  "mogzy_image_path": "assets/champions/Draven/icon.png",
  "mogzy_entity_ref": "Draven",
  "context_text": null,
  "aggregate_status": "mismatch",
  "editorial_direction": "buff",
  "editorial_direction_source": "riot_text_semantic",
  "numeric_direction": "positive",
  "changes": [
    {
      "group_title": "Base Stats",
      "ability_slot": null,
      "ability_icon_url": null,
      "property_name": "Attack Damage",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "62",
      "after_raw": "64",
      "detail_text": null,
      "mogzy_property": "base_ad",
      "mogzy_current_raw": "62",
      "mogzy_status": "mismatch",
      "proposal_id": null,
      "proposal_status": null
    }
  ]
};

export const SR_AURORA: PatchReportCard = {
  "id": 3234,
  "entity_type": "champion",
  "entity_name": "Aurora",
  "entity_slug": "Aurora",
  "section_id": "patch-champions",
  "section_title": "Champions",
  "official_image_url": "https://am-a.akamaihd.net/image?f=https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Aurora.png",
  "mogzy_image_path": "assets/champions/Aurora/icon.png",
  "mogzy_entity_ref": "Aurora",
  "context_text": null,
  "aggregate_status": "mismatch",
  "editorial_direction": "buff",
  "editorial_direction_source": "riot_patch_highlights",
  "numeric_direction": "positive",
  "changes": [
    {
      "group_title": "E - The Weirding",
      "ability_slot": "E",
      "ability_icon_url": "https://ddragon.leagueoflegends.com/cdn/16.12.1/img/spell/AuroraE.png",
      "property_name": "Base Damage",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "70 / 110 / 150 / 190 / 230",
      "after_raw": "80 / 120 / 160 / 200 / 240",
      "detail_text": null,
      "mogzy_property": "ability_damage_formula",
      "mogzy_current_raw": "(30 + 40 * P_E + 0,7 * AP) * MOD_Magic",
      "mogzy_status": "mismatch",
      "proposal_id": null,
      "proposal_status": null
    },
    {
      "group_title": "R - Between Worlds",
      "ability_slot": "R",
      "ability_icon_url": "https://ddragon.leagueoflegends.com/cdn/16.12.1/img/spell/AuroraR.png",
      "property_name": "Rift Duration",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "1.75 / 2.5 / 3.25 seconds",
      "after_raw": "2.25 / 2.75 / 3.25 seconds",
      "detail_text": null,
      "mogzy_property": null,
      "mogzy_current_raw": null,
      "mogzy_status": "not_represented",
      "proposal_id": null,
      "proposal_status": null
    }
  ]
};

export const SR_APHELIOS: PatchReportCard = {
  "id": 3233,
  "entity_type": "champion",
  "entity_name": "Aphelios",
  "entity_slug": "Aphelios",
  "section_id": "patch-champions",
  "section_title": "Champions",
  "official_image_url": "https://am-a.akamaihd.net/image?f=https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Aphelios.png",
  "mogzy_image_path": "assets/champions/Aphelios/icon.png",
  "mogzy_entity_ref": "Aphelios",
  "context_text": null,
  "aggregate_status": "not_represented",
  "editorial_direction": "buff",
  "editorial_direction_source": "riot_patch_highlights",
  "numeric_direction": "positive",
  "changes": [
    {
      "group_title": "Calibrum",
      "ability_slot": null,
      "ability_icon_url": null,
      "property_name": "Moonshot Damage",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "70 - 160 (+42 - 60% bonus AD) (+100% AP)",
      "after_raw": "80 - 170 (+42 - 60% bonus AD) (+100% AP)",
      "detail_text": null,
      "mogzy_property": null,
      "mogzy_current_raw": null,
      "mogzy_status": "not_represented",
      "proposal_id": null,
      "proposal_status": null
    },
    {
      "group_title": "Severum",
      "ability_slot": null,
      "ability_icon_url": null,
      "property_name": "Healing",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "2 - 7.1%, increased to 5 - 17.75%",
      "after_raw": "2 - 8%, increased to 5 - 20%",
      "detail_text": null,
      "mogzy_property": null,
      "mogzy_current_raw": null,
      "mogzy_status": "not_represented",
      "proposal_id": null,
      "proposal_status": null
    },
    {
      "group_title": "Gravitum",
      "ability_slot": null,
      "ability_icon_url": null,
      "property_name": "Slow",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "30% for 2.5 seconds, decaying to 10% after 0.7 seconds",
      "after_raw": "30% for 2.5 seconds, decaying to 15% after 0.7 seconds",
      "detail_text": null,
      "mogzy_property": null,
      "mogzy_current_raw": null,
      "mogzy_status": "not_represented",
      "proposal_id": null,
      "proposal_status": null
    },
    {
      "group_title": "Infernum",
      "ability_slot": null,
      "ability_icon_url": null,
      "property_name": "Duskwave Cooldown",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "9 / 8.25 / 7.5 / 6.75 / 6 seconds",
      "after_raw": "8 / 7.25 / 6.5 / 5.75 / 5 seconds",
      "detail_text": null,
      "mogzy_property": null,
      "mogzy_current_raw": null,
      "mogzy_status": "not_represented",
      "proposal_id": null,
      "proposal_status": null
    },
    {
      "group_title": "Crescendum",
      "ability_slot": null,
      "ability_icon_url": null,
      "property_name": "Mini-Crescendum Damage",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "15% AD, decreasing by 1.5% AD to a minimum of 5% AD for the 8th+ chakram",
      "after_raw": "16% AD, decreasing by 1.5% AD to a minimum of 5% AD for the 9th+ chakram",
      "detail_text": null,
      "mogzy_property": null,
      "mogzy_current_raw": null,
      "mogzy_status": "not_represented",
      "proposal_id": null,
      "proposal_status": null
    }
  ]
};

export const SR_ELISE: PatchReportCard = {
  "id": 3236,
  "entity_type": "champion",
  "entity_name": "Elise",
  "entity_slug": "Elise",
  "section_id": "patch-champions",
  "section_title": "Champions",
  "official_image_url": "https://am-a.akamaihd.net/image?f=https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Elise.png",
  "mogzy_image_path": "assets/champions/Elise/icon.png",
  "mogzy_entity_ref": "Elise",
  "context_text": null,
  "aggregate_status": "not_represented",
  "editorial_direction": "buff",
  "editorial_direction_source": "riot_patch_highlights",
  "numeric_direction": "positive",
  "changes": [
    {
      "group_title": "Passive - Spider Queen",
      "ability_slot": "P",
      "ability_icon_url": null,
      "property_name": "Passive Magic Damage On-Hit",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "12 / 22 / 32 / 42",
      "after_raw": "14 / 24 / 34 / 44",
      "detail_text": null,
      "mogzy_property": null,
      "mogzy_current_raw": null,
      "mogzy_status": "not_represented",
      "proposal_id": null,
      "proposal_status": null
    },
    {
      "group_title": "W - Skittering Frenzy",
      "ability_slot": "W",
      "ability_icon_url": "https://ddragon.leagueoflegends.com/cdn/16.12.1/img/spell/EliseHumanW.png",
      "property_name": "Bonus Attack Speed",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "60 / 75 / 90 / 105 / 120%",
      "after_raw": "70 / 85 / 100 / 115 / 130%",
      "detail_text": null,
      "mogzy_property": null,
      "mogzy_current_raw": null,
      "mogzy_status": "not_represented",
      "proposal_id": null,
      "proposal_status": null
    }
  ]
};

export const SR_VI: PatchReportCard = {
  "id": 3247,
  "entity_type": "champion",
  "entity_name": "Vi",
  "entity_slug": "Vi",
  "section_id": "patch-champions",
  "section_title": "Champions",
  "official_image_url": "https://am-a.akamaihd.net/image?f=https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Vi.png",
  "mogzy_image_path": "assets/champions/Vi/icon.png",
  "mogzy_entity_ref": "Vi",
  "context_text": null,
  "aggregate_status": "mismatch",
  "editorial_direction": "adjustment",
  "editorial_direction_source": "mogzy_inferred",
  "numeric_direction": "non_numeric",
  "changes": [
    {
      "group_title": "Base Stats",
      "ability_slot": null,
      "ability_icon_url": null,
      "property_name": "Attack Damage",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "63 + 3.5/Level",
      "after_raw": "61 + 3.9/Level",
      "detail_text": null,
      "mogzy_property": "base_ad",
      "mogzy_current_raw": "63",
      "mogzy_status": "needs_interpretation",
      "proposal_id": null,
      "proposal_status": null
    },
    {
      "group_title": "Passive - Blast Shield",
      "ability_slot": "P",
      "ability_icon_url": null,
      "property_name": "Shield",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "12% Maximum Health",
      "after_raw": "10% Maximum Health",
      "detail_text": null,
      "mogzy_property": "ability_shield_formula",
      "mogzy_current_raw": "0,12 * HP * MOD_Shield",
      "mogzy_status": "mismatch",
      "proposal_id": null,
      "proposal_status": null
    }
  ]
};

export const SR_ANIVIA_26_10: PatchReportCard = {
  "id": 2941,
  "entity_type": "champion",
  "entity_name": "Anivia",
  "entity_slug": "Anivia",
  "section_id": "patch-champions",
  "section_title": "Champions",
  "official_image_url": "https://am-a.akamaihd.net/image?f=https://ddragon.leagueoflegends.com/cdn/16.9.1/img/champion/Anivia.png",
  "mogzy_image_path": "assets/champions/Anivia/icon.png",
  "mogzy_entity_ref": "Anivia",
  "context_text": null,
  "aggregate_status": "applied",
  "editorial_direction": null,
  "editorial_direction_source": null,
  "numeric_direction": null,
  "changes": [
    {
      "group_title": "Base Stats",
      "ability_slot": null,
      "ability_icon_url": null,
      "property_name": "Base Armor",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "21",
      "after_raw": "19",
      "detail_text": null,
      "mogzy_property": "base_armor",
      "mogzy_current_raw": "19",
      "mogzy_status": "applied",
      "proposal_id": 494,
      "proposal_status": "APPLIED"
    },
    {
      "group_title": "Base Stats",
      "ability_slot": null,
      "ability_icon_url": null,
      "property_name": "Armor Growth",
      "change_kind": "numeric",
      "is_new": false,
      "before_raw": "4.5",
      "after_raw": "4.1",
      "detail_text": null,
      "mogzy_property": "armor_growth",
      "mogzy_current_raw": "4.1",
      "mogzy_status": "applied",
      "proposal_id": 493,
      "proposal_status": "APPLIED"
    }
  ]
};
