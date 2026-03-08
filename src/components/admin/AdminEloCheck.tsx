import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LeagueRow {
  id: string;
  name: string;
  type: string;
  itemCount: number;
  isEnabled: boolean;
}

export default function AdminEloCheck() {
  const [userLeagues, setUserLeagues] = useState<LeagueRow[]>([]);
  const [presetLeagues, setPresetLeagues] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeagues();
  }, []);

  const loadLeagues = async () => {
    const [{ data: leagues }, { data: settings }, { data: items }, { data: memberships }] = await Promise.all([
      supabase.from("leagues").select("id, name, type").order("name"),
      supabase.from("elo_check_league_settings").select("league_id, is_enabled"),
      supabase.from("preset_items").select("league_id"),
      supabase.from("league_memberships").select("league_id"),
    ]);

    const enabledMap = new Map<string, boolean>();
    settings?.forEach((s: any) => enabledMap.set(s.league_id, s.is_enabled));

    const presetCountMap = new Map<string, number>();
    items?.forEach((i: any) => {
      presetCountMap.set(i.league_id, (presetCountMap.get(i.league_id) || 0) + 1);
    });

    const userCountMap = new Map<string, number>();
    memberships?.forEach((m: any) => {
      userCountMap.set(m.league_id, (userCountMap.get(m.league_id) || 0) + 1);
    });

    const users: LeagueRow[] = [];
    const presets: LeagueRow[] = [];

    leagues?.forEach((l: any) => {
      const row: LeagueRow = {
        id: l.id,
        name: l.name,
        type: l.type,
        itemCount: l.type === "preset" ? (presetCountMap.get(l.id) || 0) : (userCountMap.get(l.id) || 0),
        isEnabled: enabledMap.has(l.id) ? enabledMap.get(l.id)! : true, // default enabled
      };
      if (l.type === "user") users.push(row);
      else presets.push(row);
    });

    setUserLeagues(users);
    setPresetLeagues(presets);
    setLoading(false);
  };

  const toggleLeague = async (leagueId: string, enabled: boolean, type: "user" | "preset") => {
    // Upsert the setting
    const { error } = await supabase
      .from("elo_check_league_settings")
      .upsert({ league_id: leagueId, is_enabled: enabled }, { onConflict: "league_id" });

    if (error) {
      toast.error("Failed to update");
      return;
    }

    const updater = type === "user" ? setUserLeagues : setPresetLeagues;
    updater(prev => prev.map(l => l.id === leagueId ? { ...l, isEnabled: enabled } : l));
  };

  const renderTable = (leagues: LeagueRow[], type: "user" | "preset") => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Active</TableHead>
          <TableHead>League</TableHead>
          <TableHead className="text-right">{type === "preset" ? "Items" : "Members"}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leagues.map(league => (
          <TableRow key={league.id}>
            <TableCell>
              <Checkbox
                checked={league.isEnabled}
                onCheckedChange={(checked) => toggleLeague(league.id, !!checked, type)}
              />
            </TableCell>
            <TableCell className="font-medium">{league.name}</TableCell>
            <TableCell className="text-right text-muted-foreground">{league.itemCount}</TableCell>
          </TableRow>
        ))}
        {leagues.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
              No {type} leagues found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Toggle which leagues appear in the Aura Check game. Unchecked leagues won't have their items shown.
      </p>
      <Tabs defaultValue="preset-items" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="preset-items" className="flex-1">Preset Items</TabsTrigger>
          <TabsTrigger value="users" className="flex-1">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="preset-items">
          {renderTable(presetLeagues, "preset")}
        </TabsContent>
        <TabsContent value="users">
          {renderTable(userLeagues, "user")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
