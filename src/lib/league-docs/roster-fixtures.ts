/**
 * Test fixtures mirroring real /api/docs/pro/roster/* responses.
 *
 * Every payload here was transcribed from live production responses so the
 * tests exercise the actual contract — including the identity case that must
 * never regress: "M1nG" is an ALIAS of the Thai player "Flure", while "M1ng"
 * is a SEPARATE canonical Taiwanese player.
 */
import type {
  RosterCoverage,
  RosterMembership,
  RosterPlayerDetail,
  RosterPlayersResponse,
  RosterSearchResponse,
  RosterTeamDetail,
  RosterTeamsResponse,
} from "@/lib/league-docs/roster-api";

export const coverageFixture: RosterCoverage = {
  total_players: 20624,
  total_teams: 3523,
  total_memberships: 81072,
  membership_level_a: 71170,
  membership_level_b: 3599,
  membership_level_c: 6303,
  public_default_count: 71170,
  warning_eligible_count: 3599,
  hidden_review_count: 6303,
  unresolved_observations: 17010,
  ambiguous_observations: 549,
  source_years: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
  disclosure:
    "Public roster records are uniquely resolved memberships from Leaguepedia source data. Level A rows are shown by default; Level B rows (benign historical overlaps such as academy/main or event rosters) are shown only on request with a status label. Ambiguous or conflicting records are held for internal review and are not shown.",
};

export const playersFixture: RosterPlayersResponse = {
  players: [
    { page: "Flure", display_name: "Flure", country: "Thailand", primary_role: "Jungle", membership_count: 2 },
    { page: "Faker", display_name: "Faker", country: "South Korea", primary_role: "Mid", membership_count: 4 },
    { page: "0ri (Adam Matěj)", display_name: "0ri (Adam Matěj)", country: "Czech Republic", primary_role: "Jungle", membership_count: 6 },
  ],
  pagination: { page: 1, page_size: 25, total: 18287, total_pages: 732 },
};

export const teamsFixture: RosterTeamsResponse = {
  teams: [
    { page: "100 Thieves", display_name: "100 Thieves", region: "Americas", membership_count: 35 },
    { page: "T1", display_name: "T1", region: "Korea", membership_count: 33 },
    { page: "300 (North American Team)", display_name: "300", region: "North America", membership_count: 6 },
  ],
  pagination: { page: 1, page_size: 25, total: 3460, total_pages: 139 },
};

const flureMemberships: RosterMembership[] = [
  {
    membership_key: "FlureBangkok TitansJungle;Mid2012-04-302012-05-18",
    player_page: "Flure",
    player_display_name: "Flure",
    team_page: "Bangkok Titans",
    team_display_name: "Bangkok Titans",
    region: "SEA",
    role: "Jungle;Mid",
    start_date: "2012-04-30",
    end_date: "2012-05-18",
    start_precision: "day",
    end_precision: "day",
    is_active: false,
    source_url: "https://lol.fandom.com/wiki/Flure",
    eligibility_level: "A",
    warning_code: null,
    reason_codes: [],
  },
  {
    membership_key: "FlureTongtex SunsTop2020-06-012021-10-13",
    player_page: "Flure",
    player_display_name: "Flure",
    team_page: "Tongtex Suns",
    team_display_name: "Tongtex Suns (東泰太陽)",
    region: "Asia Pacific",
    role: "Top",
    start_date: "2020-06-01",
    end_date: "2021-10-13",
    start_precision: "day",
    end_precision: "day",
    is_active: false,
    source_url: "https://lol.fandom.com/wiki/Flure",
    eligibility_level: "A",
    warning_code: null,
    reason_codes: [],
  },
];

/** Canonical Thai player. "M1nG" is one of this page's aliases. */
export const flureFixture: RosterPlayerDetail = {
  page: "Flure",
  display_name: "Flure",
  country: "Thailand",
  primary_role: "Jungle",
  aliases: ["M1nG", "M1nG (Noppakun Jiruphathum)"],
  memberships: flureMemberships,
  eligibility_shown: ["A"],
  hidden_count: 0,
};

/** A DIFFERENT canonical player from Taiwan. Not related to Flure in any way. */
export const m1ngFixture: RosterPlayerDetail = {
  page: "M1ng",
  display_name: "M1ng",
  country: "Taiwan",
  primary_role: "Jungle",
  aliases: [],
  memberships: [],
  eligibility_shown: ["A"],
  hidden_count: 0,
};

const levelAMembership: RosterMembership = {
  membership_key: "Meteos100 ThievesJungle2017-11-222018-07-01",
  player_page: "Meteos",
  player_display_name: "Meteos",
  team_page: "100 Thieves",
  team_display_name: "100 Thieves",
  region: "Americas",
  role: "Jungle",
  start_date: "2017-11-22",
  end_date: "2018-07-01",
  start_precision: "day",
  end_precision: "day",
  is_active: false,
  source_url: "https://lol.fandom.com/wiki/Meteos",
  eligibility_level: "A",
  warning_code: null,
  reason_codes: [],
};

const levelBMembership: RosterMembership = {
  membership_key: "Ssumday100 ThievesTop2017-11-222022-11-21",
  player_page: "Ssumday",
  player_display_name: "Ssumday",
  team_page: "100 Thieves",
  team_display_name: "100 Thieves",
  region: "Americas",
  role: "Top",
  start_date: "2017-11-22",
  end_date: "2022-11-21",
  start_precision: "day",
  end_precision: "day",
  is_active: false,
  source_url: "https://lol.fandom.com/wiki/Ssumday",
  eligibility_level: "B",
  warning_code: "academy_main_overlap",
  reason_codes: ["academy_main_overlap"],
};

/** Level A view: the Level B row is absent and counted in hidden_count. */
export const teamLevelAFixture: RosterTeamDetail = {
  page: "100 Thieves",
  display_name: "100 Thieves",
  region: "Americas",
  aliases: ["100", "100T", "Hundred Thieves"],
  historical_names: [],
  memberships: [levelAMembership],
  eligibility_shown: ["A"],
  hidden_count: 13,
};

/** Level AB view: the Level B row appears, carrying its warning code. */
export const teamLevelABFixture: RosterTeamDetail = {
  ...teamLevelAFixture,
  memberships: [levelAMembership, levelBMembership],
  eligibility_shown: ["A", "B"],
  hidden_count: 1,
};

export const teamWithHistoricalNamesFixture: RosterTeamDetail = {
  page: "T1",
  display_name: "T1",
  region: "Korea",
  aliases: [],
  historical_names: ["SK Telecom T1"],
  memberships: [
    {
      membership_key: "KeriaT1Support2020-11-17null",
      player_page: "Keria",
      player_display_name: "Keria",
      team_page: "T1",
      team_display_name: "T1",
      region: "Korea",
      role: "Support",
      start_date: "2020-11-17",
      end_date: null,
      start_precision: "day",
      end_precision: "open",
      is_active: true,
      source_url: "https://lol.fandom.com/wiki/Keria",
      eligibility_level: "A",
      warning_code: null,
      reason_codes: [],
    },
  ],
  eligibility_shown: ["A"],
  hidden_count: 0,
};

/**
 * Searching the alias spelling "M1nG" returns BOTH identities, as two separate
 * rows. That separation IS the anti-conflation guarantee — not a leak.
 *
 * Flure leads because "M1nG" is exactly its alias; the unrelated canonical
 * player "M1ng" is listed in its own right, credited to no alias. The backend
 * used to omit M1ng from search entirely — it has no memberships, and search
 * was built from the membership table — which left Flure as the only answer a
 * reader looking for M1ng was ever offered.
 */
export const m1ngSearchFixture: RosterSearchResponse = {
  query: "M1nG",
  results: [
    { type: "player", page: "Flure", display_name: "Flure", matched_alias: "M1nG", region: null },
    { type: "player", page: "M1ng", display_name: "M1ng", matched_alias: null, region: null },
  ],
};

export const mixedSearchFixture: RosterSearchResponse = {
  query: "T1",
  results: [
    { type: "team", page: "T1", display_name: "T1", matched_alias: null, region: "Korea" },
    { type: "team", page: "T1 Esports Academy", display_name: "T1 Esports Academy", matched_alias: null, region: "Korea" },
    { type: "player", page: "T1en", display_name: "T1en", matched_alias: null, region: null },
    { type: "player", page: "Tiger1", display_name: "Tiger1", matched_alias: "T1ger", region: null },
  ],
};
