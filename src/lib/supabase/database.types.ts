// Generated from the Supabase project "Pulkro" (ref cbdzndpdpwtxbhshidyi) with the MCP generate_typescript_types tool,
// after migrations 20261011020831 … 20261011043034. Do not edit by hand: regenerate after every migration
// (`supabase gen types typescript --project-id cbdzndpdpwtxbhshidyi > src/lib/supabase/database.types.ts`).

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["actor_kind"]
          actor_name: string
          at: string
          device_at: string | null
          entity: Database["public"]["Enums"]["audit_entity"]
          entity_id: string
          id: number
          op_id: string | null
          order_id: string | null
          reason: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          actor_name: string
          at?: string
          device_at?: string | null
          entity: Database["public"]["Enums"]["audit_entity"]
          entity_id: string
          id?: never
          op_id?: string | null
          order_id?: string | null
          reason?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          actor_name?: string
          at?: string
          device_at?: string | null
          entity?: Database["public"]["Enums"]["audit_entity"]
          entity_id?: string
          id?: never
          op_id?: string | null
          order_id?: string | null
          reason?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      case_events: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          id: string
          order_id: string
          text: string
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          id?: string
          order_id: string
          text: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          id?: string
          order_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "post_sale_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          hue: number
          id: string
          name: string
          row_version: number
          segment: Database["public"]["Enums"]["client_segment"]
          short_name: string
          since: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          hue?: number
          id: string
          name: string
          row_version?: number
          segment: Database["public"]["Enums"]["client_segment"]
          short_name: string
          since?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          hue?: number
          id?: string
          name?: string
          row_version?: number
          segment?: Database["public"]["Enums"]["client_segment"]
          short_name?: string
          since?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_changes: {
        Row: {
          created_at: string
          created_by: string
          id: string
          jornada_id: string | null
          order_id: string
          reason: string
          updated_at: string
          worker_ids: string[]
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          jornada_id?: string | null
          order_id: string
          reason?: string
          updated_at?: string
          worker_ids: string[]
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          jornada_id?: string | null
          order_id?: string
          reason?: string
          updated_at?: string
          worker_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "crew_changes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_changes_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_changes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          blocks_closure: boolean
          created_at: string
          created_by: string
          description: string
          device_at: string | null
          folio: string
          id: string
          jornada_id: string | null
          order_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          row_version: number
          severity: Database["public"]["Enums"]["severity"]
          status: Database["public"]["Enums"]["incident_status"]
          type: Database["public"]["Enums"]["incident_type"]
          updated_at: string
        }
        Insert: {
          blocks_closure?: boolean
          created_at?: string
          created_by: string
          description: string
          device_at?: string | null
          folio: string
          id: string
          jornada_id?: string | null
          order_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          row_version?: number
          severity: Database["public"]["Enums"]["severity"]
          status?: Database["public"]["Enums"]["incident_status"]
          type: Database["public"]["Enums"]["incident_type"]
          updated_at?: string
        }
        Update: {
          blocks_closure?: boolean
          created_at?: string
          created_by?: string
          description?: string
          device_at?: string | null
          folio?: string
          id?: string
          jornada_id?: string | null
          order_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          row_version?: number
          severity?: Database["public"]["Enums"]["severity"]
          status?: Database["public"]["Enums"]["incident_status"]
          type?: Database["public"]["Enums"]["incident_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_checks: {
        Row: {
          accuracy: number
          created_at: string
          created_by: string
          device_at: string
          id: string
          jornada_id: string
          kind: Database["public"]["Enums"]["check_kind"]
          lat: number
          lng: number
          note: string | null
          offline: boolean
          order_id: string
          server_at: string
          source: Database["public"]["Enums"]["geo_source"]
          updated_at: string
        }
        Insert: {
          accuracy: number
          created_at?: string
          created_by: string
          device_at: string
          id?: string
          jornada_id: string
          kind: Database["public"]["Enums"]["check_kind"]
          lat: number
          lng: number
          note?: string | null
          offline?: boolean
          order_id: string
          server_at?: string
          source: Database["public"]["Enums"]["geo_source"]
          updated_at?: string
        }
        Update: {
          accuracy?: number
          created_at?: string
          created_by?: string
          device_at?: string
          id?: string
          jornada_id?: string
          kind?: Database["public"]["Enums"]["check_kind"]
          lat?: number
          lng?: number
          note?: string | null
          offline?: boolean
          order_id?: string
          server_at?: string
          source?: Database["public"]["Enums"]["geo_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornada_checks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_checks_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_checks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_notes: {
        Row: {
          created_at: string
          created_by: string
          device_at: string | null
          id: string
          jornada_id: string
          order_id: string
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          device_at?: string | null
          id: string
          jornada_id: string
          order_id: string
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          device_at?: string | null
          id?: string
          jornada_id?: string
          order_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornada_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_notes_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas: {
        Row: {
          breakdown: Json | null
          breakdown_note: string | null
          created_at: string
          date: string
          day_index: number
          deleted_at: string | null
          id: string
          order_id: string
          planned_end: string
          planned_start: string
          row_version: number
          status: Database["public"]["Enums"]["jornada_status"]
          updated_at: string
          worker_ids: string[]
        }
        Insert: {
          breakdown?: Json | null
          breakdown_note?: string | null
          created_at?: string
          date: string
          day_index: number
          deleted_at?: string | null
          id: string
          order_id: string
          planned_end: string
          planned_start: string
          row_version?: number
          status?: Database["public"]["Enums"]["jornada_status"]
          updated_at?: string
          worker_ids?: string[]
        }
        Update: {
          breakdown?: Json | null
          breakdown_note?: string | null
          created_at?: string
          date?: string
          day_index?: number
          deleted_at?: string | null
          id?: string
          order_id?: string
          planned_end?: string
          planned_start?: string
          row_version?: number
          status?: Database["public"]["Enums"]["jornada_status"]
          updated_at?: string
          worker_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "jornadas_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          id: string
          name: string
          row_version: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          row_version?: number
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          row_version?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_closures: {
        Row: {
          conformity_at: string | null
          conformity_comment: string | null
          conformity_method:
            | Database["public"]["Enums"]["conformity_method"]
            | null
          conformity_name: string | null
          conformity_role: string | null
          conformity_signature: string | null
          created_at: string
          device_at: string | null
          exception_at: string | null
          exception_authorized_by: string | null
          exception_reason: string | null
          id: string
          order_id: string
          summary: string
          updated_at: string
          validated_at: string
          validated_by: string
          version: number
        }
        Insert: {
          conformity_at?: string | null
          conformity_comment?: string | null
          conformity_method?:
            | Database["public"]["Enums"]["conformity_method"]
            | null
          conformity_name?: string | null
          conformity_role?: string | null
          conformity_signature?: string | null
          created_at?: string
          device_at?: string | null
          exception_at?: string | null
          exception_authorized_by?: string | null
          exception_reason?: string | null
          id: string
          order_id: string
          summary: string
          updated_at?: string
          validated_at?: string
          validated_by: string
          version: number
        }
        Update: {
          conformity_at?: string | null
          conformity_comment?: string | null
          conformity_method?:
            | Database["public"]["Enums"]["conformity_method"]
            | null
          conformity_name?: string | null
          conformity_role?: string | null
          conformity_signature?: string | null
          created_at?: string
          device_at?: string | null
          exception_at?: string | null
          exception_authorized_by?: string | null
          exception_reason?: string | null
          id?: string
          order_id?: string
          summary?: string
          updated_at?: string
          validated_at?: string
          validated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_closures_exception_authorized_by_fkey"
            columns: ["exception_authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_closures_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_closures_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          activities: string[]
          archived_at: string | null
          client_id: string
          commercial_ref: string
          created_at: string
          created_by: string
          folio: string
          id: string
          materials: Json
          planned_days: number
          previous_status: Database["public"]["Enums"]["order_status"] | null
          priority: Database["public"]["Enums"]["order_priority"]
          reopened_at: string | null
          row_version: number
          scheduled_end: string
          scheduled_start: string
          scope_changed_at: string
          service_type_id: string
          site_contact_name: string
          site_contact_phone: string
          site_id: string
          special_instructions: string
          status: Database["public"]["Enums"]["order_status"]
          supervisor_id: string
          title: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          activities?: string[]
          archived_at?: string | null
          client_id: string
          commercial_ref?: string
          created_at?: string
          created_by: string
          folio: string
          id: string
          materials?: Json
          planned_days?: number
          previous_status?: Database["public"]["Enums"]["order_status"] | null
          priority?: Database["public"]["Enums"]["order_priority"]
          reopened_at?: string | null
          row_version?: number
          scheduled_end: string
          scheduled_start: string
          scope_changed_at?: string
          service_type_id: string
          site_contact_name?: string
          site_contact_phone?: string
          site_id: string
          special_instructions?: string
          status?: Database["public"]["Enums"]["order_status"]
          supervisor_id: string
          title: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          activities?: string[]
          archived_at?: string | null
          client_id?: string
          commercial_ref?: string
          created_at?: string
          created_by?: string
          folio?: string
          id?: string
          materials?: Json
          planned_days?: number
          previous_status?: Database["public"]["Enums"]["order_status"] | null
          priority?: Database["public"]["Enums"]["order_priority"]
          reopened_at?: string | null
          row_version?: number
          scheduled_end?: string
          scheduled_start?: string
          scope_changed_at?: string
          service_type_id?: string
          site_contact_name?: string
          site_contact_phone?: string
          site_id?: string
          special_instructions?: string
          status?: Database["public"]["Enums"]["order_status"]
          supervisor_id?: string
          title?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_site_belongs_to_client"
            columns: ["site_id", "client_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "orders_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          accuracy: number | null
          area: string
          attached_at: string | null
          bytes: number
          case_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          geo_source: Database["public"]["Enums"]["photo_geo_source"] | null
          height: number | null
          id: string
          incident_id: string | null
          jornada_id: string | null
          kind: Database["public"]["Enums"]["photo_kind"]
          lat: number | null
          lng: number | null
          mime_type: string
          note: string | null
          order_id: string
          origin: Database["public"]["Enums"]["photo_origin"] | null
          row_version: number
          selected_for_report: boolean
          storage_path: string
          taken_at: string
          taken_at_source: Database["public"]["Enums"]["taken_at_source"]
          updated_at: string
          width: number | null
        }
        Insert: {
          accuracy?: number | null
          area?: string
          attached_at?: string | null
          bytes: number
          case_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          geo_source?: Database["public"]["Enums"]["photo_geo_source"] | null
          height?: number | null
          id: string
          incident_id?: string | null
          jornada_id?: string | null
          kind: Database["public"]["Enums"]["photo_kind"]
          lat?: number | null
          lng?: number | null
          mime_type: string
          note?: string | null
          order_id: string
          origin?: Database["public"]["Enums"]["photo_origin"] | null
          row_version?: number
          selected_for_report?: boolean
          storage_path: string
          taken_at: string
          taken_at_source: Database["public"]["Enums"]["taken_at_source"]
          updated_at?: string
          width?: number | null
        }
        Update: {
          accuracy?: number | null
          area?: string
          attached_at?: string | null
          bytes?: number
          case_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          geo_source?: Database["public"]["Enums"]["photo_geo_source"] | null
          height?: number | null
          id?: string
          incident_id?: string | null
          jornada_id?: string | null
          kind?: Database["public"]["Enums"]["photo_kind"]
          lat?: number | null
          lng?: number | null
          mime_type?: string
          note?: string | null
          order_id?: string
          origin?: Database["public"]["Enums"]["photo_origin"] | null
          row_version?: number
          selected_for_report?: boolean
          storage_path?: string
          taken_at?: string
          taken_at_source?: Database["public"]["Enums"]["taken_at_source"]
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "post_sale_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      post_sale_cases: {
        Row: {
          category: Database["public"]["Enums"]["case_category"]
          channel: Database["public"]["Enums"]["case_channel"]
          client_id: string
          created_at: string
          created_by: string
          description: string
          due_date: string
          folio: string
          id: string
          order_id: string
          owner_id: string
          resolution: string | null
          row_version: number
          severity: Database["public"]["Enums"]["severity"]
          status: Database["public"]["Enums"]["case_status"]
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["case_category"]
          channel: Database["public"]["Enums"]["case_channel"]
          client_id: string
          created_at?: string
          created_by: string
          description: string
          due_date: string
          folio: string
          id: string
          order_id: string
          owner_id: string
          resolution?: string | null
          row_version?: number
          severity: Database["public"]["Enums"]["severity"]
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["case_category"]
          channel?: Database["public"]["Enums"]["case_channel"]
          client_id?: string
          created_at?: string
          created_by?: string
          description?: string
          due_date?: string
          folio?: string
          id?: string
          order_id?: string
          owner_id?: string
          resolution?: string | null
          row_version?: number
          severity?: Database["public"]["Enums"]["severity"]
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_cases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_cases_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          deactivated_at: string | null
          email: string
          hue: number
          id: string
          initials: string
          name: string
          phone: string
          role: Database["public"]["Enums"]["user_role"]
          row_version: number
          title: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deactivated_at?: string | null
          email: string
          hue?: number
          id: string
          initials: string
          name: string
          phone?: string
          role: Database["public"]["Enums"]["user_role"]
          row_version?: number
          title?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deactivated_at?: string | null
          email?: string
          hue?: number
          id?: string
          initials?: string
          name?: string
          phone?: string
          role?: Database["public"]["Enums"]["user_role"]
          row_version?: number
          title?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      report_shares: {
        Row: {
          channel: Database["public"]["Enums"]["share_channel"]
          created_at: string
          created_by: string
          device_at: string | null
          id: string
          note: string
          order_id: string
          recipient: string
          report_id: string
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["share_channel"]
          created_at?: string
          created_by: string
          device_at?: string | null
          id: string
          note?: string
          order_id: string
          recipient?: string
          report_id: string
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["share_channel"]
          created_at?: string
          created_by?: string
          device_at?: string | null
          id?: string
          note?: string
          order_id?: string
          recipient?: string
          report_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          closure_id: string
          created_at: string
          device_at: string | null
          generated_at: string
          generated_by: string
          id: string
          order_id: string
          photo_ids: string[]
          snapshot: Json
          summary: string
          updated_at: string
          version: number
        }
        Insert: {
          closure_id: string
          created_at?: string
          device_at?: string | null
          generated_at?: string
          generated_by: string
          id: string
          order_id: string
          photo_ids?: string[]
          snapshot: Json
          summary?: string
          updated_at?: string
          version: number
        }
        Update: {
          closure_id?: string
          created_at?: string
          device_at?: string | null
          generated_at?: string
          generated_by?: string
          id?: string
          order_id?: string
          photo_ids?: string[]
          snapshot?: Json
          summary?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "order_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          created_at: string
          default_hours_per_day: number
          hue: number
          id: string
          name: string
          row_version: number
          short: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_hours_per_day: number
          hue?: number
          id: string
          name: string
          row_version?: number
          short: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_hours_per_day?: number
          hue?: number
          id?: string
          name?: string
          row_version?: number
          short?: string
          updated_at?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          address: string
          client_id: string
          created_at: string
          id: string
          lat: number
          lng: number
          municipality: string
          name: string
          row_version: number
          updated_at: string
        }
        Insert: {
          address?: string
          client_id: string
          created_at?: string
          id: string
          lat: number
          lng: number
          municipality?: string
          name: string
          row_version?: number
          updated_at?: string
        }
        Update: {
          address?: string
          client_id?: string
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          municipality?: string
          name?: string
          row_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_tokens: {
        Row: {
          created_at: string
          order_id: string
          survey_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          order_id: string
          survey_id: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          order_id?: string
          survey_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_tokens_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: true
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          channel: Database["public"]["Enums"]["share_channel"]
          client_id: string
          comment: string | null
          created_at: string
          id: string
          manual: boolean
          nps: number | null
          order_id: string
          overall: number | null
          punctuality: number | null
          quality: number | null
          recorded_by: string | null
          responded_at: string | null
          respondent_name: string | null
          row_version: number
          sent_at: string
          sent_by: string
          staff: number | null
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["share_channel"]
          client_id: string
          comment?: string | null
          created_at?: string
          id: string
          manual?: boolean
          nps?: number | null
          order_id: string
          overall?: number | null
          punctuality?: number | null
          quality?: number | null
          recorded_by?: string | null
          responded_at?: string | null
          respondent_name?: string | null
          row_version?: number
          sent_at?: string
          sent_by: string
          staff?: number | null
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["share_channel"]
          client_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          manual?: boolean
          nps?: number | null
          order_id?: string
          overall?: number | null
          punctuality?: number | null
          quality?: number | null
          recorded_by?: string | null
          responded_at?: string | null
          respondent_name?: string | null
          row_version?: number
          sent_at?: string
          sent_by?: string
          staff?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surveys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          city: string
          code: string
          created_at: string
          id: string
          name: string
          row_version: number
          updated_at: string
        }
        Insert: {
          city?: string
          code: string
          created_at?: string
          id?: string
          name: string
          row_version?: number
          updated_at?: string
        }
        Update: {
          city?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          row_version?: number
          updated_at?: string
        }
        Relationships: []
      }
      workers: {
        Row: {
          active: boolean
          created_at: string
          hue: number
          id: string
          initials: string
          name: string
          phone: string
          row_version: number
          specialty: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          hue?: number
          id: string
          initials: string
          name: string
          phone?: string
          row_version?: number
          specialty?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          hue?: number
          id?: string
          initials?: string
          name?: string
          phone?: string
          row_version?: number
          specialty?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workers_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_case_note: {
        Args: { p_case_id: string; p_op_id: string; p_text: string }
        Returns: Json
      }
      add_incident: {
        Args: {
          p_blocks_closure?: boolean
          p_description: string
          p_device_at?: string
          p_incident_id: string
          p_jornada_id?: string
          p_op_id: string
          p_order_id: string
          p_severity: Database["public"]["Enums"]["severity"]
          p_type: Database["public"]["Enums"]["incident_type"]
        }
        Returns: Json
      }
      add_jornada_note: {
        Args: {
          p_device_at?: string
          p_jornada_id: string
          p_note_id: string
          p_op_id: string
          p_text: string
        }
        Returns: Json
      }
      add_photo: {
        Args: {
          p_accuracy?: number
          p_area?: string
          p_attached_at?: string
          p_case_id?: string
          p_geo_source?: Database["public"]["Enums"]["photo_geo_source"]
          p_height?: number
          p_incident_id?: string
          p_jornada_id?: string
          p_kind: Database["public"]["Enums"]["photo_kind"]
          p_lat?: number
          p_lng?: number
          p_note?: string
          p_op_id: string
          p_order_id: string
          p_origin?: Database["public"]["Enums"]["photo_origin"]
          p_photo_id: string
          p_selected_for_report?: boolean
          p_storage_path: string
          p_taken_at?: string
          p_taken_at_source?: Database["public"]["Enums"]["taken_at_source"]
          p_width?: number
        }
        Returns: Json
      }
      archive_order: {
        Args: { p_op_id: string; p_order_id: string; p_reason?: string }
        Returns: Json
      }
      assign_crew: {
        Args: {
          p_jornada_id?: string
          p_op_id: string
          p_order_id: string
          p_reason?: string
          p_worker_ids: string[]
        }
        Returns: Json
      }
      cancel_order: {
        Args: { p_op_id: string; p_order_id: string; p_reason: string }
        Returns: Json
      }
      check_in: {
        Args: {
          p_accuracy: number
          p_device_at: string
          p_jornada_id: string
          p_lat: number
          p_lng: number
          p_note?: string
          p_offline?: boolean
          p_op_id: string
          p_source?: Database["public"]["Enums"]["geo_source"]
        }
        Returns: Json
      }
      check_out: {
        Args: {
          p_accuracy: number
          p_device_at: string
          p_jornada_id: string
          p_lat: number
          p_lng: number
          p_note?: string
          p_offline?: boolean
          p_op_id: string
          p_source?: Database["public"]["Enums"]["geo_source"]
        }
        Returns: Json
      }
      create_case: {
        Args: {
          p_case_id: string
          p_category: Database["public"]["Enums"]["case_category"]
          p_channel: Database["public"]["Enums"]["case_channel"]
          p_description: string
          p_due_date: string
          p_op_id: string
          p_order_id: string
          p_owner_id: string
          p_severity: Database["public"]["Enums"]["severity"]
          p_status?: Database["public"]["Enums"]["case_status"]
        }
        Returns: Json
      }
      create_order: {
        Args: {
          p_activities?: string[]
          p_client_id: string
          p_commercial_ref?: string
          p_days?: Json
          p_materials?: Json
          p_op_id: string
          p_order_id: string
          p_priority?: Database["public"]["Enums"]["order_priority"]
          p_service_type_id: string
          p_site_contact_name?: string
          p_site_contact_phone?: string
          p_site_id: string
          p_special_instructions?: string
          p_supervisor_id: string
          p_title: string
        }
        Returns: Json
      }
      create_survey: {
        Args: {
          p_channel: Database["public"]["Enums"]["share_channel"]
          p_op_id: string
          p_order_id: string
          p_survey_id: string
          p_token: string
        }
        Returns: Json
      }
      delete_photo: {
        Args: { p_op_id: string; p_photo_id: string }
        Returns: Json
      }
      generate_report: {
        Args: {
          p_device_at?: string
          p_op_id: string
          p_order_id: string
          p_photo_ids?: string[]
          p_report_id: string
          p_summary?: string
        }
        Returns: Json
      }
      get_survey: { Args: { p_token: string }; Returns: Json }
      log_reminder: {
        Args: {
          p_jornada_id?: string
          p_note?: string
          p_op_id: string
          p_order_id: string
        }
        Returns: Json
      }
      log_share: {
        Args: {
          p_channel: Database["public"]["Enums"]["share_channel"]
          p_device_at?: string
          p_op_id: string
          p_recipient?: string
          p_report_id: string
          p_share_id: string
        }
        Returns: Json
      }
      provision_profile: {
        Args: {
          p_hue?: number
          p_name: string
          p_op_id: string
          p_phone?: string
          p_role: Database["public"]["Enums"]["user_role"]
          p_title?: string
          p_unit_id: string
          p_user_id: string
        }
        Returns: Json
      }
      record_manual_survey: {
        Args: {
          p_comment?: string
          p_nps: number
          p_op_id: string
          p_order_id: string
          p_overall: number
          p_punctuality: number
          p_quality: number
          p_respondent_name: string
          p_staff: number
          p_survey_id?: string
          p_token?: string
        }
        Returns: Json
      }
      reopen_order: {
        Args: { p_op_id: string; p_order_id: string; p_reason: string }
        Returns: Json
      }
      resolve_incident: {
        Args: { p_incident_id: string; p_op_id: string; p_resolution: string }
        Returns: Json
      }
      schedule_jornadas: {
        Args: {
          p_days: Json
          p_op_id: string
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      set_jornada_breakdown: {
        Args: {
          p_breakdown: Json
          p_jornada_id: string
          p_note?: string
          p_op_id: string
        }
        Returns: Json
      }
      set_order_status: {
        Args: {
          p_op_id: string
          p_order_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: Json
      }
      set_photo_selected: {
        Args: { p_op_id: string; p_photo_id: string; p_selected: boolean }
        Returns: Json
      }
      submit_survey: {
        Args: {
          p_comment?: string
          p_nps: number
          p_overall: number
          p_punctuality: number
          p_quality: number
          p_respondent_name?: string
          p_staff: number
          p_token: string
        }
        Returns: Json
      }
      sync_reconcile: {
        Args: { p_ids: string[]; p_table: string }
        Returns: string[]
      }
      update_case: {
        Args: {
          p_case_id: string
          p_note?: string
          p_op_id: string
          p_patch?: Json
        }
        Returns: Json
      }
      update_incident: {
        Args: { p_incident_id: string; p_op_id: string; p_patch: Json }
        Returns: Json
      }
      update_my_contact: {
        Args: { p_op_id: string; p_phone: string }
        Returns: Json
      }
      update_order: {
        Args: {
          p_op_id: string
          p_order_id: string
          p_patch: Json
          p_reason?: string
        }
        Returns: Json
      }
      update_photo: {
        Args: { p_op_id: string; p_patch: Json; p_photo_id: string }
        Returns: Json
      }
      update_profile: {
        Args: { p_op_id: string; p_patch: Json; p_user_id: string }
        Returns: Json
      }
      upsert_client: {
        Args: {
          p_client_id: string
          p_contact_email?: string
          p_contact_name?: string
          p_contact_phone?: string
          p_hue?: number
          p_name: string
          p_op_id: string
          p_segment: Database["public"]["Enums"]["client_segment"]
          p_short_name: string
          p_since?: string
          p_unit_id: string
        }
        Returns: Json
      }
      upsert_material: {
        Args: {
          p_material_id: string
          p_name: string
          p_op_id: string
          p_unit: string
        }
        Returns: Json
      }
      upsert_service_type: {
        Args: {
          p_default_hours_per_day: number
          p_hue?: number
          p_name: string
          p_op_id: string
          p_service_type_id: string
          p_short: string
        }
        Returns: Json
      }
      upsert_site: {
        Args: {
          p_address?: string
          p_client_id: string
          p_lat: number
          p_lng: number
          p_municipality?: string
          p_name: string
          p_op_id: string
          p_site_id: string
        }
        Returns: Json
      }
      upsert_unit: {
        Args: {
          p_city?: string
          p_code: string
          p_name: string
          p_op_id: string
          p_unit_id: string
        }
        Returns: Json
      }
      upsert_worker: {
        Args: {
          p_active?: boolean
          p_hue?: number
          p_name: string
          p_op_id: string
          p_phone?: string
          p_specialty?: string
          p_unit_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      validate_closure: {
        Args: {
          p_closure_id: string
          p_conformity_at?: string
          p_conformity_comment?: string
          p_conformity_method?: Database["public"]["Enums"]["conformity_method"]
          p_conformity_name?: string
          p_conformity_role?: string
          p_conformity_signature?: string
          p_device_at?: string
          p_exception_reason?: string
          p_op_id: string
          p_order_id: string
          p_summary: string
        }
        Returns: Json
      }
    }
    Enums: {
      actor_kind: "usuario" | "cliente" | "sistema"
      audit_entity:
        | "orden"
        | "jornada"
        | "foto"
        | "incidencia"
        | "reporte"
        | "caso"
        | "encuesta"
        | "catalogo"
        | "usuario"
      case_category:
        | "calidad"
        | "puntualidad"
        | "personal"
        | "danos"
        | "faltante"
        | "facturacion"
        | "otro"
      case_channel:
        | "telefono"
        | "whatsapp"
        | "correo"
        | "encuesta"
        | "presencial"
      case_status: "abierto" | "en_proceso" | "resuelto" | "cerrado"
      check_kind: "entrada" | "salida"
      client_segment: "Industrial" | "Comercial" | "Residencial"
      conformity_method: "firma" | "verbal" | "correo"
      geo_source: "gps" | "manual" | "remota"
      incident_status: "abierta" | "resuelta"
      incident_type:
        | "danos"
        | "faltante_material"
        | "faltante_personal"
        | "trabajo_adicional"
        | "retraso_ausencia"
        | "solicitud_queja"
        | "otra"
      jornada_status: "pendiente" | "en_curso" | "cerrada"
      order_priority: "normal" | "alta"
      order_status:
        | "borrador"
        | "programada"
        | "en_ejecucion"
        | "jornada_cerrada"
        | "pendiente_validacion"
        | "finalizada"
        | "reporte_enviado"
        | "seguimiento"
        | "archivada"
        | "cancelada"
        | "reprogramada"
        | "con_incidencia"
        | "reabierta"
      photo_geo_source: "exif" | "device"
      photo_kind: "antes" | "despues" | "incidencia" | "postventa"
      photo_origin: "camera" | "gallery"
      severity: "baja" | "media" | "alta"
      share_channel: "whatsapp" | "email" | "descarga"
      taken_at_source: "exif" | "file" | "device"
      user_role: "direccion" | "administracion" | "supervisor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      actor_kind: ["usuario", "cliente", "sistema"],
      audit_entity: [
        "orden",
        "jornada",
        "foto",
        "incidencia",
        "reporte",
        "caso",
        "encuesta",
        "catalogo",
        "usuario",
      ],
      case_category: [
        "calidad",
        "puntualidad",
        "personal",
        "danos",
        "faltante",
        "facturacion",
        "otro",
      ],
      case_channel: [
        "telefono",
        "whatsapp",
        "correo",
        "encuesta",
        "presencial",
      ],
      case_status: ["abierto", "en_proceso", "resuelto", "cerrado"],
      check_kind: ["entrada", "salida"],
      client_segment: ["Industrial", "Comercial", "Residencial"],
      conformity_method: ["firma", "verbal", "correo"],
      geo_source: ["gps", "manual", "remota"],
      incident_status: ["abierta", "resuelta"],
      incident_type: [
        "danos",
        "faltante_material",
        "faltante_personal",
        "trabajo_adicional",
        "retraso_ausencia",
        "solicitud_queja",
        "otra",
      ],
      jornada_status: ["pendiente", "en_curso", "cerrada"],
      order_priority: ["normal", "alta"],
      order_status: [
        "borrador",
        "programada",
        "en_ejecucion",
        "jornada_cerrada",
        "pendiente_validacion",
        "finalizada",
        "reporte_enviado",
        "seguimiento",
        "archivada",
        "cancelada",
        "reprogramada",
        "con_incidencia",
        "reabierta",
      ],
      photo_geo_source: ["exif", "device"],
      photo_kind: ["antes", "despues", "incidencia", "postventa"],
      photo_origin: ["camera", "gallery"],
      severity: ["baja", "media", "alta"],
      share_channel: ["whatsapp", "email", "descarga"],
      taken_at_source: ["exif", "file", "device"],
      user_role: ["direccion", "administracion", "supervisor"],
    },
  },
} as const
