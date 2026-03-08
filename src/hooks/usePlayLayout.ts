import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LayoutTopLevel {
  key: string;
  label: string;
  icon: string;
  hidden: boolean;
  order: number;
}

export interface LayoutCategory {
  key: string;
  parentKey: string;
  hidden: boolean;
  order: number;
  customLabel: string | null;
}

export interface LayoutLeague {
  id: string;
  hidden: boolean;
  order: number;
  customLabel: string | null;
}

export interface PlayLayoutConfig {
  topLevel: LayoutTopLevel[];
  categories: LayoutCategory[];
  leagues: LayoutLeague[];
}

const DEFAULT_CONFIG: PlayLayoutConfig = {
  topLevel: [],
  categories: [],
  leagues: [],
};

export function usePlayLayout(variant: "published" | "draft" = "published") {
  const [config, setConfig] = useState<PlayLayoutConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase
      .from("play_layout_config")
      .select("config")
      .eq("id", variant)
      .single();

    if (data?.config && typeof data.config === "object") {
      setConfig(data.config as unknown as PlayLayoutConfig);
    } else {
      setConfig(null);
    }
    setLoading(false);
  }, [variant]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, loading, refetch: fetchConfig };
}

export function usePlayLayoutAdmin() {
  const { config: draftConfig, loading, refetch } = usePlayLayout("draft");
  const [saving, setSaving] = useState(false);

  const saveDraft = useCallback(async (config: PlayLayoutConfig) => {
    setSaving(true);
    await supabase
      .from("play_layout_config")
      .upsert({ id: "draft", config: config as any, updated_at: new Date().toISOString() });
    setSaving(false);
  }, []);

  const publish = useCallback(async (config: PlayLayoutConfig) => {
    setSaving(true);
    await supabase
      .from("play_layout_config")
      .upsert({ id: "published", config: config as any, updated_at: new Date().toISOString() });
    await supabase
      .from("play_layout_config")
      .upsert({ id: "draft", config: config as any, updated_at: new Date().toISOString() });
    setSaving(false);
  }, []);

  const resetToDefault = useCallback(async () => {
    setSaving(true);
    await supabase.from("play_layout_config").delete().eq("id", "draft");
    await supabase.from("play_layout_config").delete().eq("id", "published");
    setSaving(false);
    refetch();
  }, [refetch]);

  return { draftConfig, loading, saving, saveDraft, publish, resetToDefault, refetch };
}
