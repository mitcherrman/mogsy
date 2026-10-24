import { describe, expect, it } from "vitest";

import { PREMIUM_MATRIX } from "@/lib/premium/matrix";
import { fixturePulseCatalogue, fixturePulseProvider, resolvePremiumBenefits } from "./pulse-provider";
import { PREMIUM_LEAD_BENEFIT_IDS } from "./pulse-fixtures";

describe("Premium copy comes only from the canonical matrix", () => {
  it("each benefit is a shipped, differentiating row, worded exactly as the matrix words it", () => {
    const benefits = resolvePremiumBenefits(PREMIUM_LEAD_BENEFIT_IDS);
    expect(benefits.length).toBeGreaterThan(0);
    for (const b of benefits) {
      const row = PREMIUM_MATRIX.find((r) => r.id === b.id)!;
      expect(row.status).toBe("shipped");
      expect(row.differentiator).toBe(true);
      expect(b.label).toBe(row.label);
      expect(b.summary).toBe(row.userFacingSummary);
    }
  });

  it("a withdrawn, planned or unknown row is never presented", () => {
    const notShipped = PREMIUM_MATRIX.filter((r) => r.status !== "shipped").map((r) => r.id);
    const free = PREMIUM_MATRIX.filter((r) => !r.differentiator).map((r) => r.id);
    expect(resolvePremiumBenefits([...notShipped, ...free, "no-such-benefit"])).toEqual([]);
  });

  it("the fixture provider resolves the Premium scene before any scene sees it", async () => {
    const cat = await fixturePulseProvider.load();
    const premium = cat.premium![0];
    expect(premium.kind === "premium" && premium.benefits.length).toBeGreaterThan(0);
    expect(fixturePulseProvider.peek!()).toEqual(fixturePulseCatalogue());
  });
});
