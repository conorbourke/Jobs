import JSZip from "jszip";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { APP_NAME } from "@/config";

const TABLES = [
  "profiles",
  "companies",
  "roles_of_interest",
  "applications",
  "application_emails",
  "interviews",
  "cv_templates",
  "cover_templates",
  "generated_documents",
  "form_submissions",
  "ai_usage_log",
  "feature_requests",
];

const BUCKETS = ["signatures", "uploads", "generated"];

/** GDPR data portability: zip of JSON for every row + all stored files. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const zip = new JSZip();

  // All rows (RLS scopes every query to this user).
  for (const table of TABLES) {
    const idCol = table === "profiles" ? "id" : "user_id";
    const { data } = await supabase.from(table).select("*").eq(idCol, user.id);
    zip.file(`data/${table}.json`, JSON.stringify(data ?? [], null, 2));
  }

  // All stored files, walking each bucket's user folder recursively.
  for (const bucket of BUCKETS) {
    const paths = await listRecursive(supabase, bucket, user.id);
    for (const path of paths) {
      const { data: blob } = await supabase.storage.from(bucket).download(path);
      if (blob) {
        zip.file(`files/${bucket}/${path}`, await blob.arrayBuffer());
      }
    }
  }

  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${APP_NAME}-export.zip"`,
    },
  });
}

async function listRecursive(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const out: string[] = [];
  const { data: entries } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });
  for (const entry of entries ?? []) {
    const full = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      // folder
      out.push(...(await listRecursive(supabase, bucket, full)));
    } else {
      out.push(full);
    }
  }
  return out;
}
