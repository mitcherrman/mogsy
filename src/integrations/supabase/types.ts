export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      boosts: {
        Row: {
          active_until: string | null
          created_at: string
          credits: number | null
          id: string
          profile_id: string
        }
        Insert: {
          active_until?: string | null
          created_at?: string
          credits?: number | null
          id?: string
          profile_id: string
        }
        Update: {
          active_until?: string | null
          created_at?: string
          credits?: number | null
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boosts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_memberships: {
        Row: {
          elo: number
          id: string
          last_active_at: string | null
          league_id: string
          matches_played: number
          profile_id: string
        }
        Insert: {
          elo?: number
          id?: string
          last_active_at?: string | null
          league_id: string
          matches_played?: number
          profile_id: string
        }
        Update: {
          elo?: number
          id?: string
          last_active_at?: string | null
          league_id?: string
          matches_played?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_memberships_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          category: string | null
          created_at: string
          created_by_user_id: string | null
          description: string | null
          id: string
          is_promoted: boolean | null
          is_system: boolean | null
          name: string
          promoted_brand_logo: string | null
          promoted_brand_name: string | null
          promoted_until: string | null
          type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          is_promoted?: boolean | null
          is_system?: boolean | null
          name: string
          promoted_brand_logo?: string | null
          promoted_brand_name?: string | null
          promoted_until?: string | null
          type?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          is_promoted?: boolean | null
          is_system?: boolean | null
          name?: string
          promoted_brand_logo?: string | null
          promoted_brand_name?: string | null
          promoted_until?: string | null
          type?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          id: string
          league_id: string
          loser_item_id: string | null
          loser_profile_id: string | null
          winner_item_id: string | null
          winner_profile_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          loser_item_id?: string | null
          loser_profile_id?: string | null
          winner_item_id?: string | null
          winner_profile_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          loser_item_id?: string | null
          loser_profile_id?: string | null
          winner_item_id?: string | null
          winner_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_loser_profile_id_fkey"
            columns: ["loser_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_profile_id_fkey"
            columns: ["winner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      preset_items: {
        Row: {
          created_at: string
          elo: number
          external_link: string | null
          id: string
          image_url: string | null
          league_id: string
          name: string
        }
        Insert: {
          created_at?: string
          elo?: number
          external_link?: string | null
          id?: string
          image_url?: string | null
          league_id: string
          name: string
        }
        Update: {
          created_at?: string
          elo?: number
          external_link?: string | null
          id?: string
          image_url?: string | null
          league_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "preset_items_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_photos: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          sort_order: number | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          sort_order?: number | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          sort_order?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_photos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_boost_until: string | null
          admin_notes: string | null
          age: number | null
          avatar_url: string | null
          boost_credits: number | null
          created_at: string
          custom_theme: string | null
          diamonds: number | null
          display_name: string
          elo_shields: number | null
          id: string
          is_anonymous: boolean | null
          is_bot: boolean | null
          is_flagged_underage: boolean | null
          is_pro: boolean | null
          location: string | null
          profile_frame: string | null
          reveals: number | null
          rewinds: number | null
          socials: Json | null
          status_message: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_boost_until?: string | null
          admin_notes?: string | null
          age?: number | null
          avatar_url?: string | null
          boost_credits?: number | null
          created_at?: string
          custom_theme?: string | null
          diamonds?: number | null
          display_name?: string
          elo_shields?: number | null
          id?: string
          is_anonymous?: boolean | null
          is_bot?: boolean | null
          is_flagged_underage?: boolean | null
          is_pro?: boolean | null
          location?: string | null
          profile_frame?: string | null
          reveals?: number | null
          rewinds?: number | null
          socials?: Json | null
          status_message?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_boost_until?: string | null
          admin_notes?: string | null
          age?: number | null
          avatar_url?: string | null
          boost_credits?: number | null
          created_at?: string
          custom_theme?: string | null
          diamonds?: number | null
          display_name?: string
          elo_shields?: number | null
          id?: string
          is_anonymous?: boolean | null
          is_bot?: boolean | null
          is_flagged_underage?: boolean | null
          is_pro?: boolean | null
          location?: string | null
          profile_frame?: string | null
          reveals?: number | null
          rewinds?: number | null
          socials?: Json | null
          status_message?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          item_type: string
          profile_id: string
          status: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          item_type: string
          profile_id: string
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          item_type?: string
          profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_league_creator: { Args: { _league_id: string }; Returns: boolean }
      is_profile_owner: { Args: { _profile_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
