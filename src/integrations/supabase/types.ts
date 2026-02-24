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
      admin_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          metadata: Json | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          title?: string
          type?: string
        }
        Relationships: []
      }
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
          {
            foreignKeyName: "boosts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          emoji: string
          id: string
          profile_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          emoji?: string
          id?: string
          profile_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          emoji?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reports: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          reason: string | null
          reporter_profile_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          reason?: string | null
          reporter_profile_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          reporter_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          hidden_by_admin: boolean
          id: string
          is_hidden: boolean
          league_id: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          hidden_by_admin?: boolean
          id?: string
          is_hidden?: boolean
          league_id?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          hidden_by_admin?: boolean
          id?: string
          is_hidden?: boolean
          league_id?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      elo_check_games: {
        Row: {
          actual_higher_id: string
          created_at: string
          guessed_higher_id: string
          id: string
          is_correct: boolean
          item_type: string
          opponent_item_id: string
          opponent_item_league_id: string
          profile_id: string
          shown_item_id: string
          shown_item_league_id: string
        }
        Insert: {
          actual_higher_id: string
          created_at?: string
          guessed_higher_id: string
          id?: string
          is_correct: boolean
          item_type?: string
          opponent_item_id: string
          opponent_item_league_id: string
          profile_id: string
          shown_item_id: string
          shown_item_league_id: string
        }
        Update: {
          actual_higher_id?: string
          created_at?: string
          guessed_higher_id?: string
          id?: string
          is_correct?: boolean
          item_type?: string
          opponent_item_id?: string
          opponent_item_league_id?: string
          profile_id?: string
          shown_item_id?: string
          shown_item_league_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elo_check_games_opponent_item_league_id_fkey"
            columns: ["opponent_item_league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elo_check_games_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elo_check_games_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elo_check_games_shown_item_league_id_fkey"
            columns: ["shown_item_league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      elo_check_league_settings: {
        Row: {
          id: string
          is_enabled: boolean
          league_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          is_enabled?: boolean
          league_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          is_enabled?: boolean
          league_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "elo_check_league_settings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      image_reports: {
        Row: {
          created_at: string
          id: string
          image_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_reports_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "preset_item_images"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_links: {
        Row: {
          code: string
          created_at: string
          created_by_user_id: string
          expires_at: string | null
          grant_admin: boolean | null
          grant_boost_credits: number | null
          grant_diamonds: number | null
          grant_elo_shields: number | null
          grant_pro: boolean | null
          grant_reveals: number | null
          grant_rewinds: number | null
          id: string
          is_active: boolean | null
          label: string | null
          max_uses: number | null
          recommended_categories: string[] | null
          recommended_league_ids: string[] | null
          times_used: number | null
          type: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by_user_id: string
          expires_at?: string | null
          grant_admin?: boolean | null
          grant_boost_credits?: number | null
          grant_diamonds?: number | null
          grant_elo_shields?: number | null
          grant_pro?: boolean | null
          grant_reveals?: number | null
          grant_rewinds?: number | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          max_uses?: number | null
          recommended_categories?: string[] | null
          recommended_league_ids?: string[] | null
          times_used?: number | null
          type?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by_user_id?: string
          expires_at?: string | null
          grant_admin?: boolean | null
          grant_boost_credits?: number | null
          grant_diamonds?: number | null
          grant_elo_shields?: number | null
          grant_pro?: boolean | null
          grant_reveals?: number | null
          grant_rewinds?: number | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          max_uses?: number | null
          recommended_categories?: string[] | null
          recommended_league_ids?: string[] | null
          times_used?: number | null
          type?: string
        }
        Relationships: []
      }
      invite_redemptions: {
        Row: {
          created_at: string
          id: string
          invite_link_id: string
          redeemed_by_user_id: string
          referrer_user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invite_link_id: string
          redeemed_by_user_id: string
          referrer_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invite_link_id?: string
          redeemed_by_user_id?: string
          referrer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_redemptions_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "invite_links"
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
          {
            foreignKeyName: "league_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
          display_order: number | null
          id: string
          is_promoted: boolean | null
          is_system: boolean | null
          name: string
          promoted_brand_logo: string | null
          promoted_brand_name: string | null
          promoted_until: string | null
          show_elo: boolean | null
          show_rank: boolean | null
          subcategory: string | null
          type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_promoted?: boolean | null
          is_system?: boolean | null
          name: string
          promoted_brand_logo?: string | null
          promoted_brand_name?: string | null
          promoted_until?: string | null
          show_elo?: boolean | null
          show_rank?: boolean | null
          subcategory?: string | null
          type?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_promoted?: boolean | null
          is_system?: boolean | null
          name?: string
          promoted_brand_logo?: string | null
          promoted_brand_name?: string | null
          promoted_until?: string | null
          show_elo?: boolean | null
          show_rank?: boolean | null
          subcategory?: string | null
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
            foreignKeyName: "matches_loser_profile_id_fkey"
            columns: ["loser_profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_profile_id_fkey"
            columns: ["winner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_profile_id_fkey"
            columns: ["winner_profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      preset_item_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_hidden: boolean
          preset_item_id: string
          report_count: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_hidden?: boolean
          preset_item_id: string
          report_count?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_hidden?: boolean
          preset_item_id?: string
          report_count?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "preset_item_images_preset_item_id_fkey"
            columns: ["preset_item_id"]
            isOneToOne: false
            referencedRelation: "preset_items"
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
          {
            foreignKeyName: "profile_photos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
          last_seen_at: string | null
          location: string | null
          onboarding_completed: boolean | null
          preferred_categories: string[] | null
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
          last_seen_at?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          preferred_categories?: string[] | null
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
          last_seen_at?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          preferred_categories?: string[] | null
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
          {
            foreignKeyName: "purchases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invite_settings: {
        Row: {
          id: string
          is_enabled: boolean | null
          referrer_boost_credits: number | null
          referrer_diamonds: number | null
          reward_boost_credits: number | null
          reward_diamonds: number | null
          reward_elo_bonus: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          is_enabled?: boolean | null
          referrer_boost_credits?: number | null
          referrer_diamonds?: number | null
          reward_boost_credits?: number | null
          reward_diamonds?: number | null
          reward_elo_bonus?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          is_enabled?: boolean | null
          referrer_boost_credits?: number | null
          referrer_diamonds?: number | null
          reward_boost_credits?: number | null
          reward_diamonds?: number | null
          reward_elo_bonus?: number | null
          updated_at?: string
        }
        Relationships: []
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
      public_profiles: {
        Row: {
          active_boost_until: string | null
          age: number | null
          avatar_url: string | null
          created_at: string | null
          custom_theme: string | null
          display_name: string | null
          id: string | null
          is_anonymous: boolean | null
          is_bot: boolean | null
          is_pro: boolean | null
          location: string | null
          profile_frame: string | null
          socials: Json | null
          status_message: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          active_boost_until?: string | null
          age?: number | null
          avatar_url?: string | null
          created_at?: string | null
          custom_theme?: string | null
          display_name?: string | null
          id?: string | null
          is_anonymous?: boolean | null
          is_bot?: boolean | null
          is_pro?: boolean | null
          location?: string | null
          profile_frame?: string | null
          socials?: Json | null
          status_message?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          active_boost_until?: string | null
          age?: number | null
          avatar_url?: string | null
          created_at?: string | null
          custom_theme?: string | null
          display_name?: string | null
          id?: string | null
          is_anonymous?: boolean | null
          is_bot?: boolean | null
          is_pro?: boolean | null
          location?: string | null
          profile_frame?: string | null
          socials?: Json | null
          status_message?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
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
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      is_profile_owner: { Args: { _profile_id: string }; Returns: boolean }
      purchase_powerup: {
        Args: {
          _diamond_cost: number
          _powerup_field: string
          _profile_id: string
        }
        Returns: Json
      }
      record_preset_match: {
        Args: {
          _league_id: string
          _loser_item_id: string
          _winner_item_id: string
        }
        Returns: Json
      }
      record_user_match: {
        Args: {
          _caller_profile_id: string
          _league_id: string
          _loser_profile_id: string
          _winner_profile_id: string
        }
        Returns: Json
      }
      rewind_user_match: {
        Args: {
          _caller_profile_id: string
          _league_id: string
          _loser_profile_id: string
          _prev_loser_elo: number
          _prev_winner_elo: number
          _winner_profile_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "master_admin"
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
      app_role: ["admin", "moderator", "user", "master_admin"],
    },
  },
} as const
