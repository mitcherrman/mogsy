import { describe, expect, it } from "vitest";

import { META_REFLEX_LABEL } from "./metaReflexLabel";
import { META_REFLEX_LABEL as REEXPORTED, META_REFLEX_MODULE_ID } from "./metaReflexModule";

// SC-RENAME3: users see "Stat Check"; every machine identifier stays.
describe("SC-RENAME3 — Meta Reflex is displayed as Stat Check", () => {
  it("names the block Stat Check from one constant", () => {
    expect(META_REFLEX_LABEL).toBe("Stat Check");
    expect(REEXPORTED).toBe(META_REFLEX_LABEL);
  });

  it("keeps the internal module id", () => {
    expect(META_REFLEX_MODULE_ID).toBe("item_cost_duel");
  });
});
