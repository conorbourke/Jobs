import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "./crypto";
import { getAdminSettings } from "./settings";
import type { AdminSettings, Profile } from "./types";

/**
 * AI service layer. All inference is server-side through the platform
 * OPENAI_API_KEY (Cloudflare secret). If a user has a per-user key stored
 * (openai_api_key_encrypted — Settings UI comes later), it is used instead;
 * otherwise we fall back to the platform key. Every call is logged to
 * ai_usage_log with a cost estimate.
 */

export class AiLimitError extends Error {
  constructor() {
    super("Monthly AI generation limit reached.");
    this.name = "AiLimitError";
  }
}

async function clientForUser(profile: Pick<Profile, "openai_api_key_encrypted">) {
  let apiKey = process.env.OPENAI_API_KEY;
  if (profile.openai_api_key_encrypted) {
    try {
      apiKey = await decryptSecret(profile.openai_api_key_encrypted);
    } catch {
      // Bad/legacy user key — fall back to the platform key.
    }
  }
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey });
}

function estimateCost(
  settings: AdminSettings,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const prices = settings.model_prices?.[model];
  if (!prices) return 0;
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000;
}

async function enforceLimit(
  supabase: SupabaseClient,
  userId: string,
  settings: AdminSettings
) {
  const limit = settings.ai_monthly_generation_limit;
  if (limit == null) return; // unlimited
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());
  if ((count ?? 0) >= limit) throw new AiLimitError();
}

export interface AiCallOptions {
  supabase: SupabaseClient; // RLS client for the current user
  userId: string;
  feature: string; // logged to ai_usage_log
  system: string;
  user: string;
  /** Ask the model for a JSON object response and parse it. */
  json?: boolean;
  model?: string; // override; defaults to admin_settings.default_ai_model
  maxOutputTokens?: number;
}

export async function aiComplete(opts: AiCallOptions): Promise<string> {
  const settings = await getAdminSettings(opts.supabase);
  await enforceLimit(opts.supabase, opts.userId, settings);

  const { data: profile } = await opts.supabase
    .from("profiles")
    .select("openai_api_key_encrypted")
    .eq("id", opts.userId)
    .single();

  const openai = await clientForUser(profile ?? { openai_api_key_encrypted: null });
  const model = opts.model ?? settings.default_ai_model;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
    ...(opts.maxOutputTokens ? { max_completion_tokens: opts.maxOutputTokens } : {}),
  });

  const usage = completion.usage;
  await opts.supabase.from("ai_usage_log").insert({
    user_id: opts.userId,
    feature: opts.feature,
    model,
    input_tokens: usage?.prompt_tokens ?? 0,
    output_tokens: usage?.completion_tokens ?? 0,
    cost_estimate: estimateCost(
      settings,
      model,
      usage?.prompt_tokens ?? 0,
      usage?.completion_tokens ?? 0
    ),
  });

  return completion.choices[0]?.message?.content ?? "";
}

/** aiComplete + JSON.parse with fence stripping, for structured outputs. */
export async function aiJson<T>(opts: Omit<AiCallOptions, "json">): Promise<T> {
  const raw = await aiComplete({ ...opts, json: true });
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(cleaned) as T;
}
