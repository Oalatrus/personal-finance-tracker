export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          archived: boolean;
          created_at: string;
          currency: string;
          id: string;
          name: string;
          opening_balance_cents: number;
          opening_date: string;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          currency?: string;
          id?: string;
          name: string;
          opening_balance_cents?: number;
          opening_date: string;
          type: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          currency?: string;
          id?: string;
          name?: string;
          opening_balance_cents?: number;
          opening_date?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          amount_cents: number;
          category_id: string;
          category_kind: string;
          created_at: string;
          id: string;
          month: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount_cents: number;
          category_id: string;
          category_kind?: string;
          created_at?: string;
          id?: string;
          month: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          amount_cents?: number;
          category_id?: string;
          category_kind?: string;
          created_at?: string;
          id?: string;
          month?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'budgets_user_id_category_id_category_kind_fkey';
            columns: ['user_id', 'category_id', 'category_kind'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['user_id', 'id', 'kind'];
          },
        ];
      };
      categories: {
        Row: {
          archived: boolean;
          created_at: string;
          id: string;
          kind: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          id?: string;
          kind: string;
          name: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          account_id: string;
          created_at: string;
          id: string;
          payload_hash: string | null;
          request_id: string;
          row_count: number | null;
          user_id: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          id?: string;
          payload_hash?: string | null;
          request_id: string;
          row_count?: number | null;
          user_id?: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          id?: string;
          payload_hash?: string | null;
          request_id?: string;
          row_count?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'import_batches_user_id_account_id_fkey';
            columns: ['user_id', 'account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['user_id', 'id'];
          },
        ];
      };
      plaid_accounts: {
        Row: {
          account_id: string | null;
          bank_account_id: string;
          connection_id: string;
          mask: string | null;
          name: string;
          user_id: string;
        };
        Insert: {
          account_id?: string | null;
          bank_account_id: string;
          connection_id: string;
          mask?: string | null;
          name: string;
          user_id?: string;
        };
        Update: {
          account_id?: string | null;
          bank_account_id?: string;
          connection_id?: string;
          mask?: string | null;
          name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plaid_accounts_user_id_account_id_fkey';
            columns: ['user_id', 'account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['user_id', 'id'];
          },
          {
            foreignKeyName: 'plaid_accounts_user_id_connection_id_fkey';
            columns: ['user_id', 'connection_id'];
            isOneToOne: false;
            referencedRelation: 'plaid_connections';
            referencedColumns: ['user_id', 'id'];
          },
        ];
      };
      plaid_connections: {
        Row: {
          created_at: string;
          cursor: string | null;
          disconnected: boolean;
          encrypted_token: string | null;
          environment: string;
          id: string;
          institution: string;
          item_id: string;
          last_synced_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          cursor?: string | null;
          disconnected?: boolean;
          encrypted_token?: string | null;
          environment: string;
          id: string;
          institution?: string;
          item_id: string;
          last_synced_at?: string | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          cursor?: string | null;
          disconnected?: boolean;
          encrypted_token?: string | null;
          environment?: string;
          id?: string;
          institution?: string;
          item_id?: string;
          last_synced_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      plaid_records: {
        Row: {
          bank_account_id: string;
          connection_id: string;
          description: string;
          ignored: boolean;
          needs_review: boolean;
          pending: boolean;
          provider_id: string;
          removed: boolean;
          signed_cents: number;
          transaction_date: string;
          transaction_id: string | null;
          user_id: string;
          version: number;
        };
        Insert: {
          bank_account_id: string;
          connection_id: string;
          description: string;
          ignored?: boolean;
          needs_review?: boolean;
          pending: boolean;
          provider_id: string;
          removed?: boolean;
          signed_cents: number;
          transaction_date: string;
          transaction_id?: string | null;
          user_id?: string;
          version?: number;
        };
        Update: {
          bank_account_id?: string;
          connection_id?: string;
          description?: string;
          ignored?: boolean;
          needs_review?: boolean;
          pending?: boolean;
          provider_id?: string;
          removed?: boolean;
          signed_cents?: number;
          transaction_date?: string;
          transaction_id?: string | null;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'plaid_records_user_id_connection_id_bank_account_id_fkey';
            columns: ['user_id', 'connection_id', 'bank_account_id'];
            isOneToOne: false;
            referencedRelation: 'plaid_accounts';
            referencedColumns: ['user_id', 'connection_id', 'bank_account_id'];
          },
          {
            foreignKeyName: 'plaid_records_user_id_transaction_id_fkey';
            columns: ['user_id', 'transaction_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['user_id', 'id'];
          },
        ];
      };
      transactions: {
        Row: {
          account_id: string;
          amount_cents: number;
          category_id: string | null;
          created_at: string;
          description: string;
          destination_account_id: string | null;
          id: string;
          import_batch_id: string | null;
          import_row_number: number | null;
          kind: string;
          transaction_date: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          amount_cents: number;
          category_id?: string | null;
          created_at?: string;
          description?: string;
          destination_account_id?: string | null;
          id?: string;
          import_batch_id?: string | null;
          import_row_number?: number | null;
          kind: string;
          transaction_date: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          account_id?: string;
          amount_cents?: number;
          category_id?: string | null;
          created_at?: string;
          description?: string;
          destination_account_id?: string | null;
          id?: string;
          import_batch_id?: string | null;
          import_row_number?: number | null;
          kind?: string;
          transaction_date?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_user_id_account_id_fkey';
            columns: ['user_id', 'account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['user_id', 'id'];
          },
          {
            foreignKeyName: 'transactions_user_id_account_id_import_batch_id_fkey';
            columns: ['user_id', 'account_id', 'import_batch_id'];
            isOneToOne: false;
            referencedRelation: 'import_batches';
            referencedColumns: ['user_id', 'account_id', 'id'];
          },
          {
            foreignKeyName: 'transactions_user_id_category_id_kind_fkey';
            columns: ['user_id', 'category_id', 'kind'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['user_id', 'id', 'kind'];
          },
          {
            foreignKeyName: 'transactions_user_id_destination_account_id_fkey';
            columns: ['user_id', 'destination_account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['user_id', 'id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      import_csv_transactions: {
        Args: {
          p_account: string;
          p_allow_duplicates?: boolean;
          p_request: string;
          p_rows: Json;
        };
        Returns: number;
      };
      map_plaid_account: {
        Args: {
          p_account: string;
          p_bank_account: string;
          p_connection: string;
        };
        Returns: undefined;
      };
      review_plaid_record: {
        Args: {
          p_allow_duplicate?: boolean;
          p_category: string | null;
          p_connection: string;
          p_ignore?: boolean;
          p_provider: string;
          p_version: number;
        };
        Returns: undefined;
      };
      stage_plaid_sync: {
        Args: {
          p_connection: string;
          p_cursor: string;
          p_previous: string | null;
          p_removed: Json;
          p_rows: Json;
        };
        Returns: number;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
