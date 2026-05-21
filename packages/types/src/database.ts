/**
 * Generated Supabase database types live here.
 *
 * Regenerate with:
 *   pnpm dlx supabase gen types typescript --project-id <project-id> \
 *     > packages/types/src/database.ts
 *
 * Placeholder until first generation. Both apps/web and apps/mobile import
 * `Database` from `@actorrise/types` so the schema stays in lockstep.
 */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T] extends { Row: infer R } ? R : never;
