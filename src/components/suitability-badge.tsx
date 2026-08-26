import { SUITABILITY_BADGE_CLASSES, SUITABILITY_LABELS } from "@/lib/labels";
import type { Suitability } from "@/lib/types";

/**
 * Low / Medium / High match pill. Shown on New Jobs drafts and recommended
 * jobs. `reason` (if given) becomes the hover title.
 */
export function SuitabilityBadge({
  value,
  reason,
  className = "",
}: {
  value: Suitability | null | undefined;
  reason?: string | null;
  className?: string;
}) {
  if (!value) return null;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${SUITABILITY_BADGE_CLASSES[value]} ${className}`}
      title={reason ?? SUITABILITY_LABELS[value]}
    >
      {SUITABILITY_LABELS[value]}
    </span>
  );
}
