// Database row types. Keep in sync with supabase/migrations.

export type Role = "user" | "superadmin";
export type Plan = "free" | "trial" | "paid";
export type ApplicationStatus =
  | "draft"
  | "applied"
  | "screening_call"
  | "in_person"
  | "next_scheduled"
  | "rejected";
export type ApplicationType = "email" | "web_form";
export type ApplicationSource = "suggested" | "application_form" | "manual";
export type EmailDirection = "from_me" | "from_company";
export type CompanyTier = "primary" | "secondary";
export type DocumentType =
  | "cv"
  | "cover_letter"
  | "company_brief"
  | "interview_prep"
  | "completed_form_pdf"
  | "completed_form_docx";
export type FormInputMethod = "url" | "pasted_questions" | "file_upload";

export interface Profile {
  id: string;
  name: string;
  role: Role;
  plan: Plan;
  trial_ends_at: string | null;
  fees_waived: boolean;
  stripe_customer_id: string | null;
  notification_email: string | null;
  openai_api_key_encrypted: string | null;
  settings: UserSettings;
  deactivated: boolean;
  ai_notice_dismissed: boolean;
  created_at: string;
}

export interface UserSettings {
  email_summary_enabled?: boolean; // default true
  auto_briefs_on_schedule?: boolean; // default true
  ics_enabled?: boolean; // default true
  default_sort?: "standard" | "newest";
}

export interface Company {
  id: string;
  user_id: string;
  name: string;
  recruitment_url: string | null;
  tier: CompanyTier;
  sort_order: number;
  created_at: string;
}

export interface RoleOfInterest {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  company_id: string | null;
  job_title: string;
  salary_text: string | null;
  location: string | null;
  status: ApplicationStatus;
  application_type: ApplicationType;
  source: ApplicationSource;
  notes: string | null;
  date_added: string;
  date_submitted: string | null;
  job_description_text: string | null;
  job_url: string | null;
  attach_portfolio: boolean;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationEmail {
  id: string;
  user_id: string;
  application_id: string;
  direction: EmailDirection;
  body_text: string;
  pasted_at: string;
}

export interface Interview {
  id: string;
  user_id: string;
  application_id: string;
  scheduled_at: string;
  location_text: string | null;
  type: string | null;
  ics_sent_at: string | null;
  briefs_generated: boolean;
  created_at: string;
}

export interface CvTemplate {
  id: string;
  user_id: string;
  label: string;
  is_master: boolean;
  content: import("./cv-schema").CvContent;
  created_at: string;
  updated_at: string;
}

export interface CoverTemplate {
  id: string;
  user_id: string;
  body: string;
  signature_image_path: string | null;
  updated_at: string;
}

export interface GeneratedDocument {
  id: string;
  user_id: string;
  application_id: string;
  type: DocumentType;
  version: number;
  storage_path: string;
  generation_notes: string | null;
  meta: { email_subject?: string; email_body?: string };
  created_at: string;
}

export interface FormQuestion {
  id: string;
  question: string;
  confidence: number; // 0..1 extraction confidence
}

export interface FormAnswer {
  id: string;
  answer: string;
  confidence: number; // 0..1 placement/quality confidence
  edited?: boolean;
}

export interface FormSubmission {
  id: string;
  user_id: string;
  application_id: string;
  input_method: FormInputMethod;
  original_file_path: string | null;
  questions: FormQuestion[];
  answers: FormAnswer[];
  verification: FormVerification;
  output_paths: { pdf?: string; docx?: string };
  created_at: string;
  updated_at: string;
}

export interface FormVerification {
  original_page_count?: number;
  completed_page_count?: number;
  questions_intact?: boolean;
  warnings?: string[];
}

export interface AiUsageLogRow {
  id: string;
  user_id: string;
  feature: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_estimate: number;
  created_at: string;
}

export interface AdminSettings {
  id: number;
  price_monthly_gbp: number;
  trial_days: number;
  max_companies: number;
  max_roles: number;
  max_cv_templates: number;
  default_ai_model: string;
  cheap_ai_model: string;
  ai_monthly_generation_limit: number | null;
  donation_url: string;
  signup_open: boolean;
  billing_enabled: boolean;
  model_prices: Record<string, { input: number; output: number }>;
  updated_at: string;
}
