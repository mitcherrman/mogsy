/**
 * HUB5 — the built Daily accounts, and the exact input the History golden was
 * generated from.
 *
 * `timmyHistoryInput()` is the byte-for-byte file
 * `scripts/hub5-export-timmy-rows.ts` writes and
 * `scripts/hub5-generate-timmy-history.py` hashes into the golden's
 * `input_sha256`. A test recomputes it, so editing a fact without
 * regenerating the golden fails instead of shipping a History that no longer
 * matches its own facts.
 */
import { FIXTURE_ANCHOR } from "./fixtureClock";
import { GOLDEN_PAGE_SIZE } from "./goldenPageSize";
import { buildDailyAccount, canonicalJson, type BuiltDailyAccount, type DailyAccountFacts } from "./dailyFixtureBuilder";
import { FIRST_DAILY_FACTS, NEWCOMER_DAILY_FACTS, TIMMY_DAILY_FACTS } from "./timmyDailyFacts";

export const TIMMY_DAILY: BuiltDailyAccount = buildDailyAccount(TIMMY_DAILY_FACTS);
export const FIRST_DAILY: BuiltDailyAccount = buildDailyAccount(FIRST_DAILY_FACTS);
export const NEWCOMER_DAILY: BuiltDailyAccount = buildDailyAccount(NEWCOMER_DAILY_FACTS);

const ACCOUNTS: Record<string, [DailyAccountFacts, BuiltDailyAccount]> = {
  timmy: [TIMMY_DAILY_FACTS, TIMMY_DAILY],
  first_daily: [FIRST_DAILY_FACTS, FIRST_DAILY],
  newcomer: [NEWCOMER_DAILY_FACTS, NEWCOMER_DAILY],
};

export function timmyHistoryInput(): string {
  return canonicalJson({
    anchor: FIXTURE_ANCHOR,
    page_size: GOLDEN_PAGE_SIZE,
    accounts: Object.fromEntries(
      Object.entries(ACCOUNTS).map(([name, [facts, built]]) => [name, { user_id: facts.userId, rows: built.rows }]),
    ),
  });
}
