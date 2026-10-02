/**
 * OF4 — the Order Forge scene art, in its own tiny module so the renderer and
 * the round-media preparer (`rankedRoundMedia`) name the SAME bundled URL: the
 * preparer warms exactly the file the backdrop `<img>` will request, and the
 * backdrop is decoded before the Order Forge round is presented.
 *
 * Decorative and answer-free (the same image for every Order Forge round), so
 * preparing it says nothing about the round's content.
 */
import baseShop from "@/assets/ranked/base-shop.jpg";

export const ORDER_FORGE_BACKDROP_URL: string = baseShop;
