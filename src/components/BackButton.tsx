"use client";

import { SmartBack } from "@/components/SmartBack";

type BackButtonProps = {
  /** If set, navigates here instead of the smart map. */
  href?: string;
  "aria-label"?: string;
  className?: string;
  inline?: boolean;
};

/**
 * Deterministic back control (no router.back loops). Uses {@link SmartBack} under the hood.
 */
export function BackButton({ href, "aria-label": ariaLabel, className, inline }: BackButtonProps) {
  return <SmartBack href={href} aria-label={ariaLabel} className={className} inline={inline} />;
}
