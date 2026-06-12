import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKETS = ["signatures", "uploads", "generated"];

/**
 * GDPR right to erasure: hard-deletes the auth user (DB rows cascade via FKs)
 * and removes every Storage object under the user's folders.
 * Requires typed confirmation ("DELETE") from the Settings flow.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { confirmation } = await request.json().catch(() => ({}));
  if (confirmation !== "DELETE") {
    return NextResponse.json(
      { error: 'Type "DELETE" to confirm account deletion.' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. Storage objects (FK cascade does not cover these).
  for (const bucket of BUCKETS) {
    const paths = await listRecursive(admin, bucket, user.id);
    if (paths.length > 0) {
      await admin.storage.from(bucket).remove(paths);
    }
  }

  // 2. Auth user — cascades profiles and every user_id row.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function listRecursive(
  client: ReturnType<typeof createAdminClient>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const out: string[] = [];
  const { data: entries } = await client.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });
  for (const entry of entries ?? []) {
    const full = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      out.push(...(await listRecursive(client, bucket, full)));
    } else {
      out.push(full);
    }
  }
  return out;
}
