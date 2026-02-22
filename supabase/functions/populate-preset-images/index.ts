import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getWikipediaImages(searchTerm: string, category?: string | null): Promise<string[]> {
  const images: string[] = [];
  const seenUrls = new Set<string>();

  // Build multiple search queries for variety
  const queries: string[] = [searchTerm];
  if (category === 'Anime') {
    if (searchTerm.includes(' vs ')) {
      queries.push(searchTerm.split(' vs ')[0].trim());
      queries.push(searchTerm.split(' vs ')[1].trim());
    }
    queries.push(searchTerm + ' anime');
    queries.push(searchTerm + ' character');
  } else if (category === 'Movies') {
    queries.push(searchTerm + ' film');
    queries.push(searchTerm + ' movie poster');
  } else if (category === 'Video Games') {
    queries.push(searchTerm + ' video game');
    queries.push(searchTerm + ' game character');
  } else if (category === 'Celebrities') {
    queries.push(searchTerm + ' portrait');
  }

  for (const query of queries) {
    if (images.length >= 4) break;
    try {
      // Try REST API summary first
      const encoded = encodeURIComponent(query);
      const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
        headers: { 'User-Agent': 'MogsyApp/1.0 (contact@mogsy.app)' }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.thumbnail?.source) {
          const url = data.thumbnail.source.replace(/\/\d+px-/, '/400px-');
          if (!seenUrls.has(url)) { images.push(url); seenUrls.add(url); }
        }
        if (data.originalimage?.source && !seenUrls.has(data.originalimage.source)) {
          images.push(data.originalimage.source);
          seenUrls.add(data.originalimage.source);
        }
      }

      // Also try the images API for more images
      const imagesResp = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=images&imlimit=10&format=json`,
        { headers: { 'User-Agent': 'MogsyApp/1.0 (contact@mogsy.app)' } }
      );
      if (imagesResp.ok) {
        const imagesData = await imagesResp.json();
        const pages = imagesData.query?.pages;
        if (pages) {
          for (const page of Object.values(pages) as any[]) {
            if (!page.images) continue;
            for (const img of page.images) {
              if (images.length >= 4) break;
              const title = img.title as string;
              // Skip icons, logos, commons, svg
              if (/\.(svg|ico)$/i.test(title)) continue;
              if (/commons-logo|wiki|icon|flag|crest|emblem/i.test(title)) continue;

              // Get the actual image URL
              const fileResp = await fetch(
                `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json`,
                { headers: { 'User-Agent': 'MogsyApp/1.0 (contact@mogsy.app)' } }
              );
              if (fileResp.ok) {
                const fileData = await fileResp.json();
                const filePages = fileData.query?.pages;
                if (filePages) {
                  for (const fp of Object.values(filePages) as any[]) {
                    const ii = fp.imageinfo?.[0];
                    if (ii?.thumburl && !seenUrls.has(ii.thumburl)) {
                      images.push(ii.thumburl);
                      seenUrls.add(ii.thumburl);
                    }
                  }
                }
              }
              await new Promise(r => setTimeout(r, 30));
            }
          }
        }
      }
    } catch (e) {
      console.error(`Wikipedia fetch failed for "${query}":`, e);
    }
    await new Promise(r => setTimeout(r, 50));
  }

  // Final fallback: Wikipedia search API
  if (images.length === 0) {
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
              images.push(pageData.thumbnail.source.replace(/\/\d+px-/, '/400px-'));
            }
          }
        }
      }
    } catch (e) {
      console.error(`Wikipedia search failed for "${searchTerm}":`, e);
    }
  }

  return images;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the user is admin using their JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check admin role
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden - Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { category, limit: rawLimit = 10, offset = 0 } = await req.json().catch(() => ({ limit: 10, offset: 0 }));
    const limit = Math.min(Math.max(Number(rawLimit) || 10, 1), 50); // Cap at 50

    // Get all preset items
    let query = supabase.from('preset_items').select('id, name, image_url, league_id');
    const { data: items, error } = await query;
    if (error) throw error;

    // Get league info for category context
    const leagueIds = [...new Set(items?.map(i => i.league_id) || [])];
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, category')
      .in('id', leagueIds);
    const leagueMap = new Map(leagues?.map(l => [l.id, l.category]) || []);

    // Get existing images from preset_item_images table
    const itemIds = items?.map(i => i.id) || [];
    const { data: existingImages } = await supabase
      .from('preset_item_images')
      .select('preset_item_id, image_url')
      .in('preset_item_id', itemIds);

    const existingImageMap = new Map<string, Set<string>>();
    existingImages?.forEach(img => {
      const set = existingImageMap.get(img.preset_item_id) || new Set();
      set.add(img.image_url);
      existingImageMap.set(img.preset_item_id, set);
    });

    // Filter by category if specified, then apply limit/offset
    let filteredItems = category
      ? (items || []).filter(i => leagueMap.get(i.league_id) === category)
      : (items || []);

    // Prioritize items with fewer images
    filteredItems.sort((a, b) => {
      const aCount = existingImageMap.get(a.id)?.size || 0;
      const bCount = existingImageMap.get(b.id)?.size || 0;
      return aCount - bCount;
    });

    filteredItems = filteredItems.slice(offset, offset + limit);

    console.log(`Processing ${filteredItems.length} items${category ? ` in category "${category}"` : ''}`);

    const results = { updated: 0, failed: 0, images_added: 0, total: filteredItems.length, details: [] as any[] };

    for (const item of filteredItems) {
      const itemCategory = leagueMap.get(item.league_id);
      const existingUrls = existingImageMap.get(item.id) || new Set();
      const imageUrls = await getWikipediaImages(item.name, itemCategory);

      // Filter out duplicates
      const newUrls = imageUrls.filter(url => !existingUrls.has(url));

      if (newUrls.length > 0) {
        // Update main image_url if empty
        if (!item.image_url || item.image_url === '' || item.image_url.includes('ui-avatars')) {
          await supabase.from('preset_items').update({ image_url: newUrls[0] }).eq('id', item.id);
        }

        // Insert into preset_item_images table
        const inserts = newUrls.map((url, idx) => ({
          preset_item_id: item.id,
          image_url: url,
          sort_order: (existingUrls.size) + idx,
        }));

        const { error: insertError } = await supabase.from('preset_item_images').insert(inserts);
        if (!insertError) {
          results.images_added += newUrls.length;
          results.updated++;
          results.details.push({ name: item.name, status: 'updated', images_added: newUrls.length });
        } else {
          results.failed++;
          results.details.push({ name: item.name, status: 'insert_failed', error: insertError.message });
        }
      } else if (imageUrls.length === 0) {
        results.failed++;
        results.details.push({ name: item.name, status: 'no_image_found' });
      } else {
        results.details.push({ name: item.name, status: 'all_images_exist' });
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`Done: ${results.updated} updated, ${results.images_added} images added, ${results.failed} failed`);

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
