import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getWikipediaImage(searchTerm: string, category?: string | null): Promise<string | null> {
  // Build search query with context
  let query = searchTerm;
  if (category === 'Anime') {
    // For anime action scenes like "Goku vs Frieza", search for the first character
    if (searchTerm.includes(' vs ')) {
      query = searchTerm.split(' vs ')[0].trim();
    }
    query += ' anime';
  } else if (category === 'Movies') {
    query += ' film';
  } else if (category === 'Video Games') {
    query += ' video game';
  }

  const attempts = [
    query,
    searchTerm, // Try without category context
  ];

  for (const attempt of attempts) {
    try {
      const encoded = encodeURIComponent(attempt);
      const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
        headers: { 'User-Agent': 'MogsyApp/1.0 (contact@mogsy.app)' }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.thumbnail?.source) {
          // Get a larger version
          return data.thumbnail.source.replace(/\/\d+px-/, '/400px-');
        }
      }
    } catch (e) {
      console.error(`Wikipedia fetch failed for "${attempt}":`, e);
    }
  }

  // Final fallback: Wikipedia search API
  try {
    const searchResp = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&srnamespace=0&srlimit=1&format=json`,
      { headers: { 'User-Agent': 'MogsyApp/1.0 (contact@mogsy.app)' } }
    );
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const title = searchData.query?.search?.[0]?.title;
      if (title) {
        const pageResp = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
          { headers: { 'User-Agent': 'MogsyApp/1.0 (contact@mogsy.app)' } }
        );
        if (pageResp.ok) {
          const pageData = await pageResp.json();
          if (pageData.thumbnail?.source) {
            return pageData.thumbnail.source.replace(/\/\d+px-/, '/400px-');
          }
        }
      }
    }
  } catch (e) {
    console.error(`Wikipedia search failed for "${searchTerm}":`, e);
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category, limit = 10, offset = 0 } = await req.json().catch(() => ({ limit: 10, offset: 0 }));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build query for items needing images
    let query = supabase
      .from('preset_items')
      .select('id, name, image_url, league_id');

    // Filter items: null, empty, or placeholder images
    query = query.or('image_url.is.null,image_url.eq.,image_url.like.%ui-avatars%');

    const { data: items, error } = await query;
    if (error) throw error;

    // Get league info for category context
    const leagueIds = [...new Set(items?.map(i => i.league_id) || [])];
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, category')
      .in('id', leagueIds);

    const leagueMap = new Map(leagues?.map(l => [l.id, l.category]) || []);

    // Filter by category if specified, then apply limit/offset
    let filteredItems = category
      ? (items || []).filter(i => leagueMap.get(i.league_id) === category)
      : (items || []);
    filteredItems = filteredItems.slice(offset, offset + limit);

    console.log(`Processing ${filteredItems.length} items${category ? ` in category "${category}"` : ''}`);

    const results = { updated: 0, failed: 0, total: filteredItems.length, details: [] as any[] };

    for (const item of filteredItems) {
      const itemCategory = leagueMap.get(item.league_id);
      const imageUrl = await getWikipediaImage(item.name, itemCategory);

      if (imageUrl) {
        const { error: updateError } = await supabase
          .from('preset_items')
          .update({ image_url: imageUrl })
          .eq('id', item.id);

        if (!updateError) {
          results.updated++;
          results.details.push({ name: item.name, status: 'updated' });
        } else {
          results.failed++;
          results.details.push({ name: item.name, status: 'update_failed', error: updateError.message });
        }
      } else {
        results.failed++;
        results.details.push({ name: item.name, status: 'no_image_found' });
      }

      // Rate limit: 50ms between requests
      await new Promise(r => setTimeout(r, 50));
    }

    console.log(`Done: ${results.updated} updated, ${results.failed} failed`);

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
