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
      ad_creatives: {
        Row: {
          brand_name: string
          created_at: string
          cta_text: string
          destination_url: string
          id: string
          image_url: string
          is_enabled: boolean
          placement: string
          title: string
          updated_at: string
          view_duration_seconds: number
        }
        Insert: {
          brand_name?: string
          created_at?: string
          cta_text?: string
          destination_url?: string
          id?: string
          image_url?: string
          is_enabled?: boolean
          placement?: string
          title?: string
          updated_at?: string
          view_duration_seconds?: number
        }
        Update: {
          brand_name?: string
          created_at?: string
          cta_text?: string
          destination_url?: string
          id?: string
          image_url?: string
          is_enabled?: boolean
          placement?: string
          title?: string
          updated_at?: string
          view_duration_seconds?: number
        }
        Relationships: []
      }
      ad_events: {
        Row: {
          ad_mode: string
          ad_source: string
          created_at: string
          creative_id: string | null
          event_type: string
          id: string
          placement: string
          profile_id: string | null
        }
        Insert: {
          ad_mode?: string
          ad_source?: string
          created_at?: string
          creative_id?: string | null
          event_type?: string
          id?: string
          placement?: string
          profile_id?: string | null
        }
        Update: {
          ad_mode?: string
          ad_source?: string
          created_at?: string
          creative_id?: string | null
          event_type?: string
          id?: string
          placement?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_events_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
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
      animation_usage_logs: {
        Row: {
          animation_id: string
          context: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          animation_id: string
          context?: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          animation_id?: string
          context?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "animation_usage_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animation_usage_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
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
      blog_post_views: {
        Row: {
          created_at: string
          id: string
          post_id: string
          profile_id: string | null
          view_day: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          profile_id?: string | null
          view_day?: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          profile_id?: string | null
          view_day?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_user_id: string
          category: string | null
          content: Json
          cover_url: string | null
          created_at: string
          editor_mode: Database["public"]["Enums"]["blog_editor_mode"]
          id: string
          og_image_url: string | null
          published_at: string | null
          scheduled_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["blog_post_status"]
          subtitle: string
          tags: string[]
          theme: Json
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          author_user_id: string
          category?: string | null
          content?: Json
          cover_url?: string | null
          created_at?: string
          editor_mode?: Database["public"]["Enums"]["blog_editor_mode"]
          id?: string
          og_image_url?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["blog_post_status"]
          subtitle?: string
          tags?: string[]
          theme?: Json
          title?: string
          updated_at?: string
          views?: number
        }
        Update: {
          author_user_id?: string
          category?: string | null
          content?: Json
          cover_url?: string | null
          created_at?: string
          editor_mode?: Database["public"]["Enums"]["blog_editor_mode"]
          id?: string
          og_image_url?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["blog_post_status"]
          subtitle?: string
          tags?: string[]
          theme?: Json
          title?: string
          updated_at?: string
          views?: number
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
      broadcast_live_state: {
        Row: {
          id: string
          snapshot: Json
          updated_at: string
        }
        Insert: {
          id?: string
          snapshot: Json
          updated_at?: string
        }
        Update: {
          id?: string
          snapshot?: Json
          updated_at?: string
        }
        Relationships: []
      }
      champion_images: {
        Row: {
          champion_id: string
          created_at: string
          storage_path: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          champion_id: string
          created_at?: string
          storage_path: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          champion_id?: string
          created_at?: string
          storage_path?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
          blog_post_id: string | null
          content: string
          created_at: string
          hidden_by_admin: boolean
          id: string
          is_hidden: boolean
          league_id: string | null
          parent_comment_id: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          blog_post_id?: string | null
          content: string
          created_at?: string
          hidden_by_admin?: boolean
          id?: string
          is_hidden?: boolean
          league_id?: string | null
          parent_comment_id?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          blog_post_id?: string | null
          content?: string
          created_at?: string
          hidden_by_admin?: boolean
          id?: string
          is_hidden?: boolean
          league_id?: string | null
          parent_comment_id?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_blog_post_id_fkey"
            columns: ["blog_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
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
      custom_animations: {
        Row: {
          contexts: string[]
          created_at: string
          description: string
          duration_ms: number
          effects: Json
          icon: string
          id: string
          image_url: string | null
          is_enabled: boolean
          name: string
          pro_only: boolean
          sort_order: number
          sound_delay_ms: number
          sound_duration_ms: number | null
          sound_url: string | null
          updated_at: string
        }
        Insert: {
          contexts?: string[]
          created_at?: string
          description?: string
          duration_ms?: number
          effects?: Json
          icon?: string
          id?: string
          image_url?: string | null
          is_enabled?: boolean
          name: string
          pro_only?: boolean
          sort_order?: number
          sound_delay_ms?: number
          sound_duration_ms?: number | null
          sound_url?: string | null
          updated_at?: string
        }
        Update: {
          contexts?: string[]
          created_at?: string
          description?: string
          duration_ms?: number
          effects?: Json
          icon?: string
          id?: string
          image_url?: string | null
          is_enabled?: boolean
          name?: string
          pro_only?: boolean
          sort_order?: number
          sound_delay_ms?: number
          sound_duration_ms?: number | null
          sound_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      custom_links: {
        Row: {
          created_at: string | null
          created_by_user_id: string
          default_swipe_animation: string | null
          default_theme: string | null
          destination_type: string
          grant_diamonds: number | null
          grant_pro: boolean | null
          id: string
          is_active: boolean | null
          label: string | null
          league_id: string | null
          recommended_categories: string[] | null
          recommended_league_ids: string[] | null
          slug: string
          visits: number | null
        }
        Insert: {
          created_at?: string | null
          created_by_user_id: string
          default_swipe_animation?: string | null
          default_theme?: string | null
          destination_type?: string
          grant_diamonds?: number | null
          grant_pro?: boolean | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          league_id?: string | null
          recommended_categories?: string[] | null
          recommended_league_ids?: string[] | null
          slug: string
          visits?: number | null
        }
        Update: {
          created_at?: string | null
          created_by_user_id?: string
          default_swipe_animation?: string | null
          default_theme?: string | null
          destination_type?: string
          grant_diamonds?: number | null
          grant_pro?: boolean | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          league_id?: string | null
          recommended_categories?: string[] | null
          recommended_league_ids?: string[] | null
          slug?: string
          visits?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_links_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_global_sessions: {
        Row: {
          created_at: string
          id: string
          league_id: string
          profile_id: string
          session_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          profile_id: string
          session_date?: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          profile_id?: string
          session_date?: string
        }
        Relationships: []
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
      feedback: {
        Row: {
          admin_notes: string | null
          body: string
          category: string
          created_at: string
          id: string
          is_archived: boolean
          page_reference: string | null
          priority: string
          profile_id: string
          status: string
          title: string
          updated_at: string
          upvotes: number
        }
        Insert: {
          admin_notes?: string | null
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_archived?: boolean
          page_reference?: string | null
          priority?: string
          profile_id: string
          status?: string
          title?: string
          updated_at?: string
          upvotes?: number
        }
        Update: {
          admin_notes?: string | null
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_archived?: boolean
          page_reference?: string | null
          priority?: string
          profile_id?: string
          status?: string
          title?: string
          updated_at?: string
          upvotes?: number
        }
        Relationships: [
          {
            foreignKeyName: "feedback_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_upvotes: {
        Row: {
          created_at: string
          feedback_id: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          feedback_id: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          feedback_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_upvotes_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_upvotes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_upvotes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gifts: {
        Row: {
          amount_cents: number | null
          created_at: string
          diamond_amount: number | null
          gift_type: string
          id: string
          message: string | null
          metadata: Json | null
          paid_at: string | null
          recipient_email: string | null
          recipient_user_id: string | null
          redeem_code: string
          redeemed_at: string | null
          sender_email: string | null
          sender_user_id: string | null
          status: string
          stripe_price_id: string | null
          stripe_session_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          diamond_amount?: number | null
          gift_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
          paid_at?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          redeem_code?: string
          redeemed_at?: string | null
          sender_email?: string | null
          sender_user_id?: string | null
          status?: string
          stripe_price_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          diamond_amount?: number | null
          gift_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          paid_at?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          redeem_code?: string
          redeemed_at?: string | null
          sender_email?: string | null
          sender_user_id?: string | null
          status?: string
          stripe_price_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      global_elo_snapshots: {
        Row: {
          elo: number
          id: string
          item_id: string | null
          league_id: string
          profile_id: string | null
          snapshot_at: string
        }
        Insert: {
          elo: number
          id?: string
          item_id?: string | null
          league_id: string
          profile_id?: string | null
          snapshot_at?: string
        }
        Update: {
          elo?: number
          id?: string
          item_id?: string | null
          league_id?: string
          profile_id?: string | null
          snapshot_at?: string
        }
        Relationships: []
      }
      image_clicks: {
        Row: {
          created_at: string
          id: string
          image_id: string
          preset_item_id: string
          profile_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_id: string
          preset_item_id: string
          profile_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_id?: string
          preset_item_id?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_clicks_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "preset_item_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_clicks_preset_item_id_fkey"
            columns: ["preset_item_id"]
            isOneToOne: false
            referencedRelation: "preset_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_clicks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_clicks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
          grant_moderator: boolean | null
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
          grant_moderator?: boolean | null
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
          grant_moderator?: boolean | null
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
      league_animation_rules: {
        Row: {
          animation_id: string
          created_at: string
          every_n_swipes: number
          id: string
          is_enabled: boolean
          league_id: string
          sort_order: number
        }
        Insert: {
          animation_id: string
          created_at?: string
          every_n_swipes?: number
          id?: string
          is_enabled?: boolean
          league_id: string
          sort_order?: number
        }
        Update: {
          animation_id?: string
          created_at?: string
          every_n_swipes?: number
          id?: string
          is_enabled?: boolean
          league_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_animation_rules_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
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
      league_swipe_entity_ratings: {
        Row: {
          entity_id: string
          entity_type: string
          game_id: string
          rating: number
          updated_at: string
          vote_count: number
          win_count: number
        }
        Insert: {
          entity_id: string
          entity_type?: string
          game_id: string
          rating?: number
          updated_at?: string
          vote_count?: number
          win_count?: number
        }
        Update: {
          entity_id?: string
          entity_type?: string
          game_id?: string
          rating?: number
          updated_at?: string
          vote_count?: number
          win_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_swipe_entity_ratings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "league_swipe_games"
            referencedColumns: ["id"]
          },
        ]
      }
      league_swipe_games: {
        Row: {
          created_at: string
          description: string | null
          entity_type: string
          id: string
          is_active: boolean
          mode: string
          prompt: string
          slug: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean
          mode: string
          prompt: string
          slug: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean
          mode?: string
          prompt?: string
          slug?: string
          title?: string
        }
        Relationships: []
      }
      league_swipe_matchups: {
        Row: {
          created_at: string
          entity_a: string
          entity_b: string
          game_id: string
          id: string
          votes_a: number
          votes_b: number
        }
        Insert: {
          created_at?: string
          entity_a: string
          entity_b: string
          game_id: string
          id?: string
          votes_a?: number
          votes_b?: number
        }
        Update: {
          created_at?: string
          entity_a?: string
          entity_b?: string
          game_id?: string
          id?: string
          votes_a?: number
          votes_b?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_swipe_matchups_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "league_swipe_games"
            referencedColumns: ["id"]
          },
        ]
      }
      league_swipe_results: {
        Row: {
          context: Json | null
          correct_entity: string | null
          created_at: string
          game_id: string
          id: string
          is_correct: boolean | null
          matchup_id: string
          other_entity: string
          other_value: number | null
          response_time_ms: number | null
          selected_entity: string
          selected_value: number | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          correct_entity?: string | null
          created_at?: string
          game_id: string
          id?: string
          is_correct?: boolean | null
          matchup_id: string
          other_entity: string
          other_value?: number | null
          response_time_ms?: number | null
          selected_entity: string
          selected_value?: number | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          correct_entity?: string | null
          created_at?: string
          game_id?: string
          id?: string
          is_correct?: boolean | null
          matchup_id?: string
          other_entity?: string
          other_value?: number | null
          response_time_ms?: number | null
          selected_entity?: string
          selected_value?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_swipe_results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "league_swipe_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_swipe_results_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "league_swipe_matchups"
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
          show_global_stats: boolean | null
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
          show_global_stats?: boolean | null
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
          show_global_stats?: boolean | null
          show_rank?: boolean | null
          subcategory?: string | null
          type?: string
        }
        Relationships: []
      }
      local_rankings: {
        Row: {
          id: string
          item_id: string | null
          league_id: string
          local_elo: number
          matches_played: number
          profile_id: string
          target_profile_id: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          item_id?: string | null
          league_id: string
          local_elo?: number
          matches_played?: number
          profile_id: string
          target_profile_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          item_id?: string | null
          league_id?: string
          local_elo?: number
          matches_played?: number
          profile_id?: string
          target_profile_id?: string | null
          updated_at?: string
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
      multiplayer_actions: {
        Row: {
          action_type: string
          created_at: string
          game_id: string
          id: string
          payload: Json
          player_id: string
          round_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          game_id: string
          id?: string
          payload?: Json
          player_id: string
          round_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          game_id?: string
          id?: string
          payload?: Json
          player_id?: string
          round_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_actions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplayer_actions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplayer_actions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplayer_games: {
        Row: {
          config: Json
          created_at: string
          finished_at: string | null
          id: string
          league_id: string | null
          league_type: string
          mode: string
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          finished_at?: string | null
          id?: string
          league_id?: string | null
          league_type?: string
          mode: string
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          finished_at?: string | null
          id?: string
          league_id?: string | null
          league_type?: string
          mode?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_games_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplayer_players: {
        Row: {
          created_at: string
          game_id: string
          id: string
          is_host: boolean
          is_ready: boolean
          profile_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          is_host?: boolean
          is_ready?: boolean
          profile_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          is_host?: boolean
          is_ready?: boolean
          profile_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplayer_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplayer_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplayer_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplayer_rounds: {
        Row: {
          created_at: string
          game_id: string
          id: string
          round_number: number
          state: Json
          winner_team_id: string | null
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          round_number: number
          state?: Json
          winner_team_id?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          round_number?: number
          state?: Json
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_rounds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplayer_rounds_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplayer_settings: {
        Row: {
          config: Json
          is_enabled: boolean
          mode: string
          updated_at: string
        }
        Insert: {
          config?: Json
          is_enabled?: boolean
          mode: string
          updated_at?: string
        }
        Update: {
          config?: Json
          is_enabled?: boolean
          mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      multiplayer_teams: {
        Row: {
          created_at: string
          game_id: string
          id: string
          score: number
          team_index: number
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          score?: number
          team_index: number
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          score?: number
          team_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_teams_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_games"
            referencedColumns: ["id"]
          },
        ]
      }
      play_layout_config: {
        Row: {
          config: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      preset_item_images: {
        Row: {
          created_at: string
          focal_x: number
          focal_y: number
          id: string
          image_url: string
          is_hidden: boolean
          mobile_focal_x: number | null
          mobile_focal_y: number | null
          mobile_pad_left: number | null
          mobile_pad_top: number | null
          mobile_zoom: number | null
          pad_left: number
          pad_top: number
          preset_item_id: string
          report_count: number
          sort_order: number
          zoom: number
        }
        Insert: {
          created_at?: string
          focal_x?: number
          focal_y?: number
          id?: string
          image_url: string
          is_hidden?: boolean
          mobile_focal_x?: number | null
          mobile_focal_y?: number | null
          mobile_pad_left?: number | null
          mobile_pad_top?: number | null
          mobile_zoom?: number | null
          pad_left?: number
          pad_top?: number
          preset_item_id: string
          report_count?: number
          sort_order?: number
          zoom?: number
        }
        Update: {
          created_at?: string
          focal_x?: number
          focal_y?: number
          id?: string
          image_url?: string
          is_hidden?: boolean
          mobile_focal_x?: number | null
          mobile_focal_y?: number | null
          mobile_pad_left?: number | null
          mobile_pad_top?: number | null
          mobile_zoom?: number | null
          pad_left?: number
          pad_top?: number
          preset_item_id?: string
          report_count?: number
          sort_order?: number
          zoom?: number
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
          mobile_title_image_max_height: number | null
          mobile_title_image_offset_x: number | null
          mobile_title_image_offset_y: number | null
          mobile_title_image_scale: number | null
          name: string
          subtitle: string
          title_image_max_height: number
          title_image_offset_x: number
          title_image_offset_y: number
          title_image_scale: number
          title_image_url: string | null
        }
        Insert: {
          created_at?: string
          elo?: number
          external_link?: string | null
          id?: string
          image_url?: string | null
          league_id: string
          mobile_title_image_max_height?: number | null
          mobile_title_image_offset_x?: number | null
          mobile_title_image_offset_y?: number | null
          mobile_title_image_scale?: number | null
          name: string
          subtitle?: string
          title_image_max_height?: number
          title_image_offset_x?: number
          title_image_offset_y?: number
          title_image_scale?: number
          title_image_url?: string | null
        }
        Update: {
          created_at?: string
          elo?: number
          external_link?: string | null
          id?: string
          image_url?: string | null
          league_id?: string
          mobile_title_image_max_height?: number | null
          mobile_title_image_offset_x?: number | null
          mobile_title_image_offset_y?: number | null
          mobile_title_image_scale?: number | null
          name?: string
          subtitle?: string
          title_image_max_height?: number
          title_image_offset_x?: number
          title_image_offset_y?: number
          title_image_scale?: number
          title_image_url?: string | null
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
      processed_media: {
        Row: {
          created_at: string
          duration: number | null
          height: number | null
          id: string
          media_type: string
          mp4_url: string | null
          original_url: string
          owner_profile_id: string | null
          thumbnail_url: string | null
          webm_url: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          height?: number | null
          id?: string
          media_type?: string
          mp4_url?: string | null
          original_url: string
          owner_profile_id?: string | null
          thumbnail_url?: string | null
          webm_url?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          height?: number | null
          id?: string
          media_type?: string
          mp4_url?: string | null
          original_url?: string
          owner_profile_id?: string | null
          thumbnail_url?: string | null
          webm_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "processed_media_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_media_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_admin_notes: {
        Row: {
          id: string
          notes: string | null
          profile_id: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          notes?: string | null
          profile_id: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          notes?: string | null
          profile_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_admin_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_admin_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_favorites: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: string
          profile_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_type?: string
          profile_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
          profile_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
          ads_enabled: boolean | null
          age: number | null
          avatar_url: string | null
          boost_credits: number | null
          created_at: string
          custom_theme: string | null
          diamonds: number | null
          display_name: string
          elo_shields: number | null
          elocheck_animation: string | null
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
          ranked_tutorial_completed_at: string | null
          ranked_tutorial_version: number | null
          reveals: number | null
          rewinds: number | null
          socials: Json | null
          status_message: string | null
          swipe_animation: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_boost_until?: string | null
          admin_notes?: string | null
          ads_enabled?: boolean | null
          age?: number | null
          avatar_url?: string | null
          boost_credits?: number | null
          created_at?: string
          custom_theme?: string | null
          diamonds?: number | null
          display_name?: string
          elo_shields?: number | null
          elocheck_animation?: string | null
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
          ranked_tutorial_completed_at?: string | null
          ranked_tutorial_version?: number | null
          reveals?: number | null
          rewinds?: number | null
          socials?: Json | null
          status_message?: string | null
          swipe_animation?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_boost_until?: string | null
          admin_notes?: string | null
          ads_enabled?: boolean | null
          age?: number | null
          avatar_url?: string | null
          boost_credits?: number | null
          created_at?: string
          custom_theme?: string | null
          diamonds?: number | null
          display_name?: string
          elo_shields?: number | null
          elocheck_animation?: string | null
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
          ranked_tutorial_completed_at?: string | null
          ranked_tutorial_version?: number | null
          reveals?: number | null
          rewinds?: number | null
          socials?: Json | null
          status_message?: string | null
          swipe_animation?: string | null
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
      saved_profiles: {
        Row: {
          created_at: string
          id: string
          saved_profile_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          saved_profile_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          saved_profile_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_profiles_saved_profile_id_fkey"
            columns: ["saved_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_profiles_saved_profile_id_fkey"
            columns: ["saved_profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorial_tip_dismissals: {
        Row: {
          dismissed_at: string
          id: string
          profile_id: string
          tip_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          profile_id: string
          tip_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          profile_id?: string
          tip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_tip_dismissals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_tip_dismissals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_tip_dismissals_tip_id_fkey"
            columns: ["tip_id"]
            isOneToOne: false
            referencedRelation: "tutorial_tips"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorial_tips: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          message: string
          page_route: string
          position: string
          sort_order: number
          target_selector: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          message: string
          page_route: string
          position?: string
          sort_order?: number
          target_selector?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          message?: string
          page_route?: string
          position?: string
          sort_order?: number
          target_selector?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_profile_id: string
          blocker_profile_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_profile_id: string
          blocker_profile_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_profile_id?: string
          blocker_profile_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_profile_id_fkey"
            columns: ["blocked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocked_profile_id_fkey"
            columns: ["blocked_profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_profile_id_fkey"
            columns: ["blocker_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_profile_id_fkey"
            columns: ["blocker_profile_id"]
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
      user_notification_reads: {
        Row: {
          id: string
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "user_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          action_url: string | null
          created_at: string
          emoji: string | null
          id: string
          image_url: string | null
          is_recurring: boolean
          is_sent: boolean
          item_id: string | null
          league_id: string | null
          message: string | null
          metadata: Json | null
          priority: string
          profile_id: string | null
          recurrence_end_at: string | null
          recurrence_rule: string | null
          scheduled_at: string | null
          sent_by_user_id: string
          target_categories: string[] | null
          target_league_ids: string[] | null
          target_type: string
          title: string
          type: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          image_url?: string | null
          is_recurring?: boolean
          is_sent?: boolean
          item_id?: string | null
          league_id?: string | null
          message?: string | null
          metadata?: Json | null
          priority?: string
          profile_id?: string | null
          recurrence_end_at?: string | null
          recurrence_rule?: string | null
          scheduled_at?: string | null
          sent_by_user_id: string
          target_categories?: string[] | null
          target_league_ids?: string[] | null
          target_type?: string
          title: string
          type?: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          image_url?: string | null
          is_recurring?: boolean
          is_sent?: boolean
          item_id?: string | null
          league_id?: string | null
          message?: string | null
          metadata?: Json | null
          priority?: string
          profile_id?: string | null
          recurrence_end_at?: string | null
          recurrence_rule?: string | null
          scheduled_at?: string | null
          sent_by_user_id?: string
          target_categories?: string[] | null
          target_league_ids?: string[] | null
          target_type?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "preset_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_profile_id: string
          reporter_profile_id: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_profile_id: string
          reporter_profile_id: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_profile_id?: string
          reporter_profile_id?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_reported_profile_id_fkey"
            columns: ["reported_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_profile_id_fkey"
            columns: ["reported_profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
      public_profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          created_at: string | null
          custom_theme: string | null
          display_name: string | null
          id: string | null
          is_anonymous: boolean | null
          is_pro: boolean | null
          location: string | null
          profile_frame: string | null
          socials: Json | null
          status_message: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          created_at?: string | null
          custom_theme?: string | null
          display_name?: string | null
          id?: string | null
          is_anonymous?: boolean | null
          is_pro?: boolean | null
          location?: string | null
          profile_frame?: string | null
          socials?: Json | null
          status_message?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          created_at?: string | null
          custom_theme?: string | null
          display_name?: string | null
          id?: string | null
          is_anonymous?: boolean | null
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
      activate_boost: { Args: never; Returns: string }
      admin_list_feedback: {
        Args: { _show_archived?: boolean }
        Returns: {
          admin_notes: string | null
          body: string
          category: string
          created_at: string
          id: string
          is_archived: boolean
          page_reference: string | null
          priority: string
          profile_id: string
          status: string
          title: string
          updated_at: string
          upvotes: number
        }[]
        SetofOptions: {
          from: "*"
          to: "feedback"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_profiles: {
        Args: never
        Returns: {
          active_boost_until: string | null
          admin_notes: string | null
          ads_enabled: boolean | null
          age: number | null
          avatar_url: string | null
          boost_credits: number | null
          created_at: string
          custom_theme: string | null
          diamonds: number | null
          display_name: string
          elo_shields: number | null
          elocheck_animation: string | null
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
          ranked_tutorial_completed_at: string | null
          ranked_tutorial_version: number | null
          reveals: number | null
          rewinds: number | null
          socials: Json | null
          status_message: string | null
          swipe_animation: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_multiplayer_game: {
        Args: {
          _config?: Json
          _host_profile_id: string
          _league_id: string
          _league_type: string
          _mode: string
          _partner_profile_id: string
        }
        Returns: Json
      }
      finish_multiplayer_game: {
        Args: { _game_id: string; _result: Json }
        Returns: undefined
      }
      get_league_swipe_stats: { Args: never; Returns: Json }
      get_my_referral_code: {
        Args: never
        Returns: {
          code: string
          created_at: string
          is_active: boolean
          times_used: number
        }[]
      }
      get_own_profile: {
        Args: never
        Returns: {
          active_boost_until: string
          ads_enabled: boolean
          age: number
          avatar_url: string
          boost_credits: number
          created_at: string
          custom_theme: string
          diamonds: number
          display_name: string
          elo_shields: number
          elocheck_animation: string
          id: string
          is_anonymous: boolean
          is_bot: boolean
          is_flagged_underage: boolean
          is_pro: boolean
          last_seen_at: string
          location: string
          onboarding_completed: boolean
          preferred_categories: string[]
          profile_frame: string
          reveals: number
          rewinds: number
          socials: Json
          status_message: string
          swipe_animation: string
          updated_at: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_custom_link_visits: {
        Args: { _slug: string }
        Returns: undefined
      }
      is_friendship_party: { Args: { _profile_id: string }; Returns: boolean }
      is_game_player: { Args: { _game_id: string }; Returns: boolean }
      is_league_creator: { Args: { _league_id: string }; Returns: boolean }
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      is_profile_owner: { Args: { _profile_id: string }; Returns: boolean }
      join_multiplayer_game: {
        Args: {
          _game_id: string
          _partner_profile_id?: string
          _profile_id: string
        }
        Returns: Json
      }
      purchase_powerup: {
        Args: {
          _diamond_cost: number
          _powerup_field: string
          _profile_id: string
        }
        Returns: Json
      }
      realtime_is_admin_topic: { Args: { _topic: string }; Returns: boolean }
      realtime_is_game_topic_player: {
        Args: { _topic: string }
        Returns: boolean
      }
      realtime_is_notification_topic_owner: {
        Args: { _topic: string }
        Returns: boolean
      }
      record_dual_preset_match: {
        Args: {
          _caller_profile_id: string
          _league_id: string
          _loser_item_id: string
          _winner_item_id: string
        }
        Returns: Json
      }
      record_dual_user_match: {
        Args: {
          _caller_profile_id: string
          _league_id: string
          _loser_profile_id: string
          _winner_profile_id: string
        }
        Returns: Json
      }
      record_league_swipe_result: {
        Args: {
          p_context?: Json
          p_correct_entity?: string
          p_game_slug: string
          p_other: string
          p_other_value?: number
          p_response_time_ms?: number
          p_selected: string
          p_selected_value?: number
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
      redeem_gift_code: { Args: { _code: string }; Returns: Json }
      redeem_invite_link: {
        Args: { _code: string; _user_id: string }
        Returns: Json
      }
      resolve_custom_link: {
        Args: { _slug: string }
        Returns: {
          default_swipe_animation: string
          default_theme: string
          destination_type: string
          id: string
          label: string
          league_id: string
          recommended_categories: string[]
          recommended_league_ids: string[]
          slug: string
          visits: number
        }[]
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
      set_round_winner: {
        Args: { _round_id: string; _winner_team_id: string }
        Returns: undefined
      }
      submit_multiplayer_action: {
        Args: {
          _action_type: string
          _game_id: string
          _payload?: Json
          _player_id: string
          _round_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "master_admin" | "demo_access"
      blog_editor_mode: "blocks" | "rich" | "canvas"
      blog_post_status: "draft" | "scheduled" | "published"
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
      app_role: ["admin", "moderator", "user", "master_admin", "demo_access"],
      blog_editor_mode: ["blocks", "rich", "canvas"],
      blog_post_status: ["draft", "scheduled", "published"],
    },
  },
} as const
