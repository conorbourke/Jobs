import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "./crypto";
import { getAdminSettings } from "./settings";
import type { AdminSettings, Profile } from "./types";

/**
 * AI service layer. All inference is server-side through the platform
 * ANTHROPIC_API_KEY (Cloudflare secret). If a user has a per-user key stored
 * (openai_api_key_encrypted — legacy column name, now holds an Anthropic key;
 * the Settings UI comes later), it is used instead; otherwise we fall back to
 * the platform key. Every call is logged to ai_usage_log with a cost estimate.
 */

export class AiLimitError extends Error {
  constructor() {
    super("Monthly AI generation limit reached.");
    this.name = "AiLimitError";
  }
}

async function clientForUser(
  profile: Pick<Profile, "openai_api_key_encrypted">
): Promise<Anthropic> {
  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (profile.openai_api_key_encrypted) {
    try {
      apiKey = await decryptSecret(profile.openai_api_key_encrypted);
    } catch {
      // Bad/legacy user key — fall back to the platform key.
    }
  }
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
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

/**
 * Two-tier model routing: the candidate-facing *writing* (tailored CV + cover
 * letter) uses the premium model (admin_settings.default_ai_model); everything
 * else (summaries, briefs, interview prep, form answers, scraping) uses the
 * cheaper model (admin_settings.cheap_ai_model). An explicit `model` override
 * always wins. Both models are configurable in Admin Settings.
 */
const WRITING_FEATURES = new Set([
  "cv_cover_generation",
  "cv_cover_regeneration",
]);

function modelForFeature(settings: AdminSettings, feature: string): string {
  if (WRITING_FEATURES.has(feature)) return settings.default_ai_model;
  return settings.cheap_ai_model || settings.default_ai_model;
}

export interface AiCallOptions {
  supabase: SupabaseClient; // RLS client for the current user
  userId: string;
  feature: string; // logged to ai_usage_log; also selects the model tier
  system: string;
  user: string;
  model?: string; // override; otherwise routed by feature (see modelForFeature)
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

  const anthropic = await clientForUser(
    profile ?? { openai_api_key_encrypted: null }
  );
  const model = opts.model ?? modelForFeature(settings, opts.feature);

  const message = await anthropic.messages.create({
    model,
    max_tokens: opts.maxOutputTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const usage = message.usage;
  await opts.supabase.from("ai_usage_log").insert({
    user_id: opts.userId,
    feature: opts.feature,
    model,
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cost_estimate: estimateCost(
      settings,
      model,
      usage?.input_tokens ?? 0,
      usage?.output_tokens ?? 0
    ),
  });

  return text;
}

/** aiComplete + JSON.parse with fence stripping, for structured outputs. */
export async function aiJson<T>(opts: AiCallOptions): Promise<T> {
  const raw = await aiComplete(opts);
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  return JSON.parse(cleaned) as T;
}
