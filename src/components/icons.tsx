import React from "react";

type IconProps = {
  className?: string;
  strokeWidth?: number;
};

const base = (path: React.ReactNode, viewBox = "0 0 24 24") =>
  function IconComp({ className = "w-4 h-4", strokeWidth = 1.75 }: IconProps) {
    return (
      <svg
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };

export const SparkleIcon = base(
  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
);

export const AiIcon = base(
  <>
    <rect x="5" y="5" width="14" height="14" rx="3" />
    <path d="M9 9h6v6H9zM9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
  </>
);

export const LockIcon = base(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </>
);

export const CheckIcon = base(<path d="M4 12l5 5L20 6" />);

export const AlertIcon = base(
  <>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 4.3l-7.5 13A2 2 0 004.5 20h15a2 2 0 001.7-2.7l-7.5-13a2 2 0 00-3.4 0z" />
  </>
);

export const SearchIcon = base(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4-4" />
  </>
);

export const DocIcon = base(
  <>
    <path d="M14 3v5h5" />
    <path d="M6 3h8l5 5v11a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path d="M9 13h6M9 17h6" />
  </>
);

export const ChevronIcon = base(<path d="M9 6l6 6-6 6" />);

export const CalcIcon = base(
  <>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01" />
  </>
);

export const TrendIcon = base(<path d="M3 17l6-6 4 4 8-8M15 7h6v6" />);

export const CloudIcon = base(
  <path d="M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0117 18H7z" />
);

export const ChipIcon = base(
  <>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <path d="M9 9h6v6H9zM7 3v2M12 3v2M17 3v2M7 19v2M12 19v2M17 19v2M3 7h2M3 12h2M3 17h2M19 7h2M19 12h2M19 17h2" />
  </>
);

export const DiskIcon = base(
  <>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
    <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
  </>
);

export const DatabaseIcon = base(
  <>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
  </>
);

export const NetworkIcon = base(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z" />
  </>
);

export const BoltIcon = base(<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" strokeLinejoin="round" />);

// Theme selector glyphs — light / dark / follow-the-system.
export const SunIcon = base(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
);

export const MoonIcon = base(
  <path d="M20 14.5A8.5 8.5 0 019.5 4a7 7 0 1010.5 10.5z" />
);

export const MonitorIcon = base(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </>
);

// Confidence dot: a filled circle in the semantic color of the confidence level.
export type Confidence = "confirmado" | "inferencia" | "fuera-de-alcance-del-billing";

const CONFIDENCE_DOT: Record<Confidence, string> = {
  confirmado: "bg-positive",
  inferencia: "bg-caution",
  "fuera-de-alcance-del-billing": "bg-ink-faint",
};

/* The Spanish-only CONFIDENCE_LABEL map that used to live here is gone: it had no
   importers, and it duplicated a mapping that now exists per locale as
   CONFIDENCE_LABELS_I18N in i18n/labels.ts. A second, untranslated copy of the
   same three labels in a component module is exactly the thing that drifts. */

// Maps a WasteCategory (finding.category) to its representative icon —
// gives each finding instant visual recognition in the collapsed/expanded header.
export type WasteCategoryIconKey =
  | "idle-resources" | "utilization-review" | "oversized-instances"
  | "unattached-storage" | "legacy-generation" | "missing-commitment"
  | "data-transfer" | "unoptimized-storage-class" | "unused-elastic-ips"
  | "excessive-snapshots" | "nat-gateway-overuse"
  | "ai-visibility" | "ai-gpu-review" | "ai-batch-opportunity"
  | "ai-endpoint-idle" | "ai-cost-attribution";

const CATEGORY_ICON: Record<string, React.ComponentType<IconProps>> = {
  "idle-resources": ChipIcon,
  "utilization-review": ChipIcon,
  "oversized-instances": ChipIcon,
  "legacy-generation": ChipIcon,
  "unattached-storage": DiskIcon,
  "excessive-snapshots": DiskIcon,
  "unoptimized-storage-class": DiskIcon,
  "missing-commitment": DatabaseIcon,
  "data-transfer": NetworkIcon,
  "nat-gateway-overuse": NetworkIcon,
  "unused-elastic-ips": NetworkIcon,
  "ai-visibility": SparkleIcon,
  "ai-gpu-review": SparkleIcon,
  "ai-batch-opportunity": SparkleIcon,
  "ai-endpoint-idle": SparkleIcon,
  "ai-cost-attribution": SparkleIcon,
};

export function categoryIcon(category: string): React.ComponentType<IconProps> {
  return CATEGORY_ICON[category] ?? BoltIcon;
}

export function ConfidenceDot({
  confidence,
  className = "",
}: {
  confidence: Confidence;
  className?: string;
}) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${CONFIDENCE_DOT[confidence] ?? "bg-ink-faint"} ${className}`}
      aria-hidden="true"
    />
  );
}
