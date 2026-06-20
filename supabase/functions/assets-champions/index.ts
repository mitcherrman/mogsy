// Public manifest of League of Legends champion assets.
// Pulls latest Data Dragon version so URLs never go stale.
// No auth required — purely public CDN URLs.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type ChampionAsset = {
  icon: string;
  splash: string;
  loading: string;
  cutout: string;
};

// Champions surfaced on the LoL Hub. Extend freely — purely additive.
const CHAMPIONS = [
  "Akali",
  "Ryze",
  "Jinx",
  "Draven",
  "Viktor",
  "Ahri",
  "Yasuo",
  "Zed",
  "Lux",
  "Ezreal",
] as const;

let cachedVersion: { value: string; expires: number } | null = null;

async function getLatestVersion(): Promise<string> {
  const now = Date.now();
  if (cachedVersion && cachedVersion.expires > now) return cachedVersion.value;
  try {
    const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
    const arr = (await res.json()) as string[];
    const v = Array.isArray(arr) && arr.length > 0 ? arr[0] : "14.24.1";
    cachedVersion = { value: v, expires: now + 6 * 60 * 60 * 1000 };
    return v;
  } catch {
    return cachedVersion?.value ?? "14.24.1";
  }
}

function buildManifest(version: string): Record<string, ChampionAsset> {
  const out: Record<string, ChampionAsset> = {};
  for (const name of CHAMPIONS) {
    out[name] = {
      icon: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${name}.png`,
      splash: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${name}_0.jpg`,
      loading: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${name}_0.jpg`,
      // Data Dragon does not publish transparent cutouts; the vertically-framed
      // loading art is the closest stand-in and renders well over dark cards.
      cutout: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${name}_0.jpg`,
    };
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const version = await getLatestVersion();
    const champions = buildManifest(version);
    return new Response(
      JSON.stringify({ version, champions }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600, s-maxage=21600",
        },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});