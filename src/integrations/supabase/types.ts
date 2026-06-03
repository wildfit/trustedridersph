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
    PostgrestVersion: "14.5"
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
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      fee_categories: {
        Row: {
          created_at: string
          entry_type: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          entry_type?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          entry_type?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      fee_entries: {
        Row: {
          amount_php: number
          category_id: string
          created_at: string
          driver_id: string
          id: string
          logged_at: string
          note: string | null
          shift_id: string | null
        }
        Insert: {
          amount_php: number
          category_id: string
          created_at?: string
          driver_id: string
          id?: string
          logged_at?: string
          note?: string | null
          shift_id?: string | null
        }
        Update: {
          amount_php?: number
          category_id?: string
          created_at?: string
          driver_id?: string
          id?: string
          logged_at?: string
          note?: string | null
          shift_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_entries_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_logs: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          liters: number
          logged_at: string
          odometer_km: number | null
          price_per_liter_php: number
          shift_id: string | null
          total_cost_php: number
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          liters: number
          logged_at?: string
          odometer_km?: number | null
          price_per_liter_php: number
          shift_id?: string | null
          total_cost_php: number
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          liters?: number
          logged_at?: string
          odometer_km?: number | null
          price_per_liter_php?: number
          shift_id?: string | null
          total_cost_php?: number
        }
        Relationships: [
          {
            foreignKeyName: "fuel_logs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_ends_at: string | null
          access_mode: string
          access_starts_at: string | null
          avatar_url: string | null
          created_at: string
          first_sign_in_completed: boolean
          fuel_tank_liters: number | null
          full_name: string | null
          id: string
          is_enabled: boolean
          last_seen_at: string | null
          motorcycle_brand: string | null
          motorcycle_model: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          access_ends_at?: string | null
          access_mode?: string
          access_starts_at?: string | null
          avatar_url?: string | null
          created_at?: string
          first_sign_in_completed?: boolean
          fuel_tank_liters?: number | null
          full_name?: string | null
          id: string
          is_enabled?: boolean
          last_seen_at?: string | null
          motorcycle_brand?: string | null
          motorcycle_model?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          access_ends_at?: string | null
          access_mode?: string
          access_starts_at?: string | null
          avatar_url?: string | null
          created_at?: string
          first_sign_in_completed?: boolean
          fuel_tank_liters?: number | null
          full_name?: string | null
          id?: string
          is_enabled?: boolean
          last_seen_at?: string | null
          motorcycle_brand?: string | null
          motorcycle_model?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      security_questions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          question_text: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          question_text: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          question_text?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          created_at: string
          driver_id: string
          ended_at: string | null
          ending_odometer_km: number | null
          gas_rate_php_per_liter: number | null
          id: string
          notes: string | null
          started_at: string
          starting_odometer_km: number | null
          starting_tank_full: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          ended_at?: string | null
          ending_odometer_km?: number | null
          gas_rate_php_per_liter?: number | null
          id?: string
          notes?: string | null
          started_at?: string
          starting_odometer_km?: number | null
          starting_tank_full?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          ended_at?: string | null
          ending_odometer_km?: number | null
          gas_rate_php_per_liter?: number | null
          id?: string
          notes?: string | null
          started_at?: string
          starting_odometer_km?: number | null
          starting_tank_full?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          created_at: string
          distance_km: number | null
          driver_id: string
          ended_at: string | null
          gross_fare_php: number
          id: string
          notes: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          shift_id: string | null
          started_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          distance_km?: number | null
          driver_id: string
          ended_at?: string | null
          gross_fare_php?: number
          id?: string
          notes?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          shift_id?: string | null
          started_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          distance_km?: number | null
          driver_id?: string
          ended_at?: string | null
          gross_fare_php?: number
          id?: string
          notes?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          shift_id?: string | null
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          driver_id: string
          id: string
          message: string | null
          proposed: Json | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          type: Database["public"]["Enums"]["request_type"]
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          driver_id: string
          id?: string
          message?: string | null
          proposed?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          type: Database["public"]["Enums"]["request_type"]
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          message?: string | null
          proposed?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          type?: Database["public"]["Enums"]["request_type"]
          updated_at?: string
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
          role: Database["public"]["Enums"]["app_role"]
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
      user_security_answers: {
        Row: {
          answer_hash: string
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          answer_hash: string
          created_at?: string
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          answer_hash?: string
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_security_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "security_questions"
            referencedColumns: ["id"]
          },
        ]
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
      hash_security_answer: { Args: { _answer: string }; Returns: string }
      verify_security_answer: {
        Args: { _answer: string; _hash: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "driver" | "admin" | "superadmin"
      request_status: "pending" | "approved" | "rejected"
      request_type: "profile_change" | "resubscribe"
      service_type: "angkas" | "pabakal" | "padala"
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
      app_role: ["driver", "admin", "superadmin"],
      request_status: ["pending", "approved", "rejected"],
      request_type: ["profile_change", "resubscribe"],
      service_type: ["angkas", "pabakal", "padala"],
    },
  },
} as const
