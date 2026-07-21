import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveGiftByPriceId, buildGiftCatalog, __setCatalogForTests } from "./gift-catalog.ts";

Deno.test("catalog: cheapest pack + massive client diamond_amount → server derives canonical 50", () => {
  __setCatalogForTests(null);
  // Simulate: attacker sends the cheapest Price ID with an inflated client-side diamond_amount.
  const clientClaimedAmount = 9_999_999;
  const entry = resolveGiftByPriceId("price_1T3UbgD9NqEQUIGhYrBcRg9p");
  assertStrictEquals(entry?.diamondAmount, 50);
  assertStrictEquals(entry?.giftType, "diamonds");
  // The client value is never authoritative — server-derived value is what we persist.
  assertEquals(entry!.diamondAmount < clientClaimedAmount, true);
});

Deno.test("catalog: unknown Price IDs are rejected", () => {
  __setCatalogForTests(null);
  assertStrictEquals(resolveGiftByPriceId("price_deadbeef"), null);
  assertStrictEquals(resolveGiftByPriceId("prod_1T3UbgD9NqEQUIGh"), null);
  assertStrictEquals(resolveGiftByPriceId(""), null);
  assertStrictEquals(resolveGiftByPriceId(null as unknown as string), null);
  assertStrictEquals(resolveGiftByPriceId(12345 as unknown as string), null);
  assertStrictEquals(resolveGiftByPriceId({ toString: () => "price_x" } as unknown as string), null);
});

Deno.test("catalog: pro gift Price IDs resolve to zero diamonds and correct gift_type", () => {
  __setCatalogForTests(null);
  const monthly = resolveGiftByPriceId("price_1TZS2yD9NqEQUIGhP9HWjgy1");
  assertStrictEquals(monthly?.giftType, "pro_monthly");
  assertStrictEquals(monthly?.diamondAmount, 0);
  const annual = resolveGiftByPriceId("price_1TZS92D9NqEQUIGhCx5fczRp");
  assertStrictEquals(annual?.giftType, "pro_annual");
  assertStrictEquals(annual?.diamondAmount, 0);
});

Deno.test("catalog: every entry is a well-formed Stripe price_ id", () => {
  __setCatalogForTests(null);
  const map = buildGiftCatalog();
  assertEquals(map.size >= 7, true);
  for (const [k, v] of map) {
    assertStrictEquals(k, v.priceId);
    assertEquals(v.priceId.startsWith("price_"), true);
    assertEquals(v.diamondAmount >= 0, true);
    if (v.giftType === "diamonds") assertEquals(v.diamondAmount > 0, true);
    else assertEquals(v.diamondAmount, 0);
  }
});

Deno.test("catalog: forged mapping via __setCatalogForTests does not leak between tests", () => {
  __setCatalogForTests([
    { priceId: "price_forged", giftType: "diamonds", diamondAmount: 999999, label: "forged" },
  ]);
  assertStrictEquals(resolveGiftByPriceId("price_forged")?.diamondAmount, 999999);
  __setCatalogForTests(null);
  assertStrictEquals(resolveGiftByPriceId("price_forged"), null);
});
