import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/config";

/**
 * Service-role client. Bypasses RLS — server-side only, used exclusively for:
 *  - GDPR account deletion (auth.admin.deleteUser + storage cleanup)
 *  - superadmin user management
 * Never import this from client components.
 */
export function createAdminClient() {
  return createSupabaseClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
