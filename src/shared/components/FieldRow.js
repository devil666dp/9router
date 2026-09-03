"use client";

/**
 * Label + field row used by the provider example / playground cards.
 * Stacks on mobile, label column on >= sm.
 */
export default function FieldRow({ label, align = "center", children }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 sm:flex-row sm:gap-3 ${align === "start" ? "sm:items-start" : "sm:items-center"}`}>
      <span className={`w-full text-xs font-medium text-text-muted sm:w-20 sm:shrink-0 ${align === "start" ? "sm:pt-2" : ""}`}>{label}</span>
      <div className="w-full min-w-0 flex-1">{children}</div>
    </div>
  );
}
