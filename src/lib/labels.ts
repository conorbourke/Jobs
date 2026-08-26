import type { ApplicationStatus, Suitability } from "./types";

export const SUITABILITY_LABELS: Record<Suitability, string> = {
  low: "Low match",
  medium: "Medium match",
  high: "High match",
};

export const SUITABILITY_BADGE_CLASSES: Record<Suitability, string> = {
  low: "bg-neutral-100 text-neutral-500",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-green-100 text-green-700",
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft",
  applied: "Applied",
  screening_call: "Screening call",
  in_person: "In person",
  next_scheduled: "Next scheduled",
  rejected: "Rejected",
};

export const STATUS_BADGE_CLASSES: Record<ApplicationStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  applied: "bg-blue-50 text-blue-700",
  screening_call: "bg-violet-50 text-violet-700",
  in_person: "bg-amber-50 text-amber-700",
  next_scheduled: "bg-green-50 text-green-700",
  rejected: "bg-neutral-100 text-neutral-400",
};

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
