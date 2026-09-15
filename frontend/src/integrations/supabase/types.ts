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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_usage_logs: {
        Row: {
          created_at: string
          id: string
          phone_number: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_number?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_number?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_takeovers: {
        Row: {
          created_at: string
          id: string
          is_taken_over: boolean
          phone_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_taken_over?: boolean
          phone_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_taken_over?: boolean
          phone_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_usage: {
        Row: {
          created_at: string
          id: string
          period_start: string
          phone_number: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          period_start: string
          phone_number: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          period_start?: string
          phone_number?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          direction: string
          id: string
          message: string
          message_type: string | null
          metadata: Json | null
          phone_number: string
          user_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          message: string
          message_type?: string | null
          metadata?: Json | null
          phone_number: string
          user_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          message?: string
          message_type?: string | null
          metadata?: Json | null
          phone_number?: string
          user_id?: string
        }
        Relationships: []
      }
      faq_usage_logs: {
        Row: {
          created_at: string
          faq_id: string
          id: string
          phone_number: string
          sender_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          faq_id: string
          id?: string
          phone_number: string
          sender_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          faq_id?: string
          id?: string
          phone_number?: string
          sender_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faq_usage_logs_faq_id_fkey"
            columns: ["faq_id"]
            isOneToOne: false
            referencedRelation: "faqs"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_active: boolean
          is_tracked: boolean
          media_urls: string[]
          product_id: string | null
          question: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_tracked?: boolean
          media_urls?: string[]
          product_id?: string | null
          question: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_tracked?: boolean
          media_urls?: string[]
          product_id?: string | null
          question?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      fcm_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          device_token: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          device_token: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          device_token?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to: string | null
          created_at: string
          customer_name: string | null
          id: string
          phone_number: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          phone_number: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          phone_number?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      message_queue: {
        Row: {
          attempts: number
          correlation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          max_attempts: number
          message_text: string | null
          message_type: string | null
          phone_number: string
          processed_at: string | null
          raw_payload: Json | null
          sender_name: string | null
          session_api_key: string | null
          status: string
          updated_at: string
          user_id: string
          wsender_message_id: string
        }
        Insert: {
          attempts?: number
          correlation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          message_text?: string | null
          message_type?: string | null
          phone_number: string
          processed_at?: string | null
          raw_payload?: Json | null
          sender_name?: string | null
          session_api_key?: string | null
          status?: string
          updated_at?: string
          user_id: string
          wsender_message_id: string
        }
        Update: {
          attempts?: number
          correlation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          message_text?: string | null
          message_type?: string | null
          phone_number?: string
          processed_at?: string | null
          raw_payload?: Json | null
          sender_name?: string | null
          session_api_key?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          wsender_message_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          customer_address: string | null
          customer_name: string
          customer_phone: string
          district: string | null
          id: string
          order_items: Json
          payment_method: string
          special_instructions: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string
          whatsapp_phone: string | null
          custom_fields?: Json | null
        }
        Insert: {
          created_at?: string
          customer_address?: string | null
          customer_name: string
          customer_phone: string
          district?: string | null
          id?: string
          order_items?: Json
          payment_method?: string
          special_instructions?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
          whatsapp_phone?: string | null
          custom_fields?: Json | null
        }
        Update: {
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string
          district?: string | null
          id?: string
          order_items?: Json
          payment_method?: string
          special_instructions?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
          whatsapp_phone?: string | null
          custom_fields?: Json | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          delivery_price: number | null
          description: string | null
          id: string
          images: string[] | null
          is_active: boolean
          name: string
          price: number
          product_type: string
          updated_at: string
          user_id: string
          variations: Json | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          delivery_price?: number | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          name: string
          price?: number
          product_type?: string
          updated_at?: string
          user_id: string
          variations?: Json | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          delivery_price?: number | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          name?: string
          price?: number
          product_type?: string
          updated_at?: string
          user_id?: string
          variations?: Json | null
          video_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          addon_ai_messages: number
          addon_contacts: number
          addon_faqs: number
          addon_images: number
          addon_orders: number
          addon_products: number
          addon_staff: number
          billing_cycle_start: string | null
          business_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          is_paused: boolean
          max_faqs: number | null
          max_products: number | null
          plan_tier: Database["public"]["Enums"]["plan_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          addon_ai_messages?: number
          addon_contacts?: number
          addon_faqs?: number
          addon_images?: number
          addon_orders?: number
          addon_products?: number
          addon_staff?: number
          billing_cycle_start?: string | null
          business_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_paused?: boolean
          max_faqs?: number | null
          max_products?: number | null
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          addon_ai_messages?: number
          addon_contacts?: number
          addon_faqs?: number
          addon_images?: number
          addon_orders?: number
          addon_products?: number
          addon_staff?: number
          billing_cycle_start?: string | null
          business_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_paused?: boolean
          max_faqs?: number | null
          max_products?: number | null
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      staff_accounts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          owner_id: string
          permissions: string[]
          staff_email: string
          staff_name: string | null
          staff_user_id: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          owner_id: string
          permissions?: string[]
          staff_email: string
          staff_name?: string | null
          staff_user_id: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          owner_id?: string
          permissions?: string[]
          staff_email?: string
          staff_name?: string | null
          staff_user_id?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_wsender_sessions: {
        Row: {
          created_at: string
          id: string
          session_api_key: string | null
          session_id: string
          session_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_api_key?: string | null
          session_id: string
          session_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_api_key?: string | null
          session_id?: string
          session_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_usage: { Args: { _user_id: string }; Returns: boolean }
      get_ai_message_usage: {
        Args: { _since: string; _user_id: string }
        Returns: number
      }
      get_contact_usage: {
        Args: { _since: string; _user_id: string }
        Returns: number
      }
      get_staff_owner_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_staff_of: {
        Args: { _owner_id: string; _staff_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "business_user"
      plan_tier: "free" | "pro" | "enterprise"
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
      app_role: ["super_admin", "business_user"],
      plan_tier: ["free", "pro", "enterprise"],
    },
  },
} as const
