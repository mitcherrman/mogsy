import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, Search, X, Plus } from "lucide-react";
import { toast } from "sonner";
import UserAvatar from "@/components/UserAvatar";

interface FavoriteItem {
  id: string;
  item_type: "preset_item" | "user_profile";
  item_id: string;
  name: string;
  image_url: string | null;
  sort_order: number;
}

interface SearchResult {
  id: string;
  name: string;
  image_url: string | null;
  type: "preset_item" | "user_profile";
}

export default function FavoritesEditor({ profileId }: { profileId: string | null }) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchType, setSearchType] = useState<"preset_item" | "user_profile">("preset_item");

  useEffect(() => {
    if (!profileId) return;
    loadFavorites();
  }, [profileId]);

  const loadFavorites = async () => {
    if (!profileId) return;
    const { data } = await supabase
      .from("profile_favorites")
      .select("*")
      .eq("profile_id", profileId)
      .order("sort_order");

    if (data) {
      // Resolve names
      const items: FavoriteItem[] = [];
      for (const fav of data) {
        if (fav.item_type === "preset_item") {
          const { data: item } = await supabase
            .from("preset_items")
            .select("id, name, image_url")
            .eq("id", fav.item_id)
            .maybeSingle();
          items.push({
            id: fav.id,
            item_type: "preset_item",
            item_id: fav.item_id,
            name: item?.name || "Unknown",
            image_url: item?.image_url || null,
            sort_order: fav.sort_order,
          });
        } else {
          const { data: prof } = await supabase
            .from("public_profiles")
            .select("id, display_name, avatar_url")
            .eq("id", fav.item_id)
            .maybeSingle();
          items.push({
            id: fav.id,
            item_type: "user_profile",
            item_id: fav.item_id,
            name: prof?.display_name || "User",
            image_url: prof?.avatar_url || null,
            sort_order: fav.sort_order,
          });
        }
      }
      setFavorites(items);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);

    if (searchType === "preset_item") {
      const { data } = await supabase
        .from("preset_items")
        .select("id, name, image_url")
        .ilike("name", `%${query}%`)
        .limit(8);
      setSearchResults(
        (data || []).map((d) => ({ id: d.id, name: d.name, image_url: d.image_url, type: "preset_item" as const }))
      );
    } else {
      const { data } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .ilike("display_name", `%${query}%`)
        .limit(8);
      setSearchResults(
        (data || []).filter((d) => d.id).map((d) => ({ id: d.id!, name: d.display_name || "User", image_url: d.avatar_url, type: "user_profile" as const }))
      );
    }
    setSearching(false);
  };

  const addFavorite = async (result: SearchResult) => {
    if (!profileId) return;
    if (favorites.length >= 5) {
      toast.error("Maximum 5 favorites allowed");
      return;
    }
    if (favorites.some((f) => f.item_id === result.id)) {
      toast.error("Already in favorites");
      return;
    }

    const { error } = await supabase.from("profile_favorites").insert({
      profile_id: profileId,
      item_type: result.type,
      item_id: result.id,
      sort_order: favorites.length,
    });

    if (error) {
      toast.error("Failed to add favorite");
      return;
    }

    toast.success(`Added ${result.name}`);
    setSearchQuery("");
    setSearchResults([]);
    loadFavorites();
  };

  const removeFavorite = async (favId: string) => {
    await supabase.from("profile_favorites").delete().eq("id", favId);
    setFavorites((prev) => prev.filter((f) => f.id !== favId));
    toast.success("Removed from favorites");
  };

  if (!profileId) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Heart className="h-5 w-5 text-primary" />
        <Label className="text-base font-bold">Favorites</Label>
        <span className="text-[10px] text-muted-foreground ml-auto">{favorites.length}/5</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Add up to 5 collection items or user profiles to showcase on your profile.
      </p>

      {/* Current favorites */}
      {favorites.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {favorites.map((fav) => (
            <div
              key={fav.id}
              className="relative group flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2"
            >
              {fav.image_url ? (
                <img src={fav.image_url} alt="" className="w-8 h-8 rounded-md object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center">
                  <UserAvatar name={fav.name} size="sm" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate max-w-[100px]">{fav.name}</p>
                <p className="text-[9px] text-muted-foreground capitalize">{fav.item_type.replace("_", " ")}</p>
              </div>
              <button
                type="button"
                onClick={() => removeFavorite(fav.id)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search to add */}
      {favorites.length < 5 && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={searchType === "preset_item" ? "default" : "outline"}
              onClick={() => { setSearchType("preset_item"); setSearchResults([]); setSearchQuery(""); }}
              className="text-xs"
            >
              Items
            </Button>
            <Button
              type="button"
              size="sm"
              variant={searchType === "user_profile" ? "default" : "outline"}
              onClick={() => { setSearchType("user_profile"); setSearchResults([]); setSearchQuery(""); }}
              className="text-xs"
            >
              Users
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={searchType === "preset_item" ? "Search items..." : "Search users..."}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="rounded-lg border border-border bg-card max-h-48 overflow-y-auto">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => addFavorite(result)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
                >
                  {result.image_url ? (
                    <img src={result.image_url} alt="" className="w-8 h-8 rounded-md object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center">
                      <UserAvatar name={result.name} size="sm" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{result.name}</p>
                  </div>
                  <Plus className="h-4 w-4 text-primary ml-auto shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
