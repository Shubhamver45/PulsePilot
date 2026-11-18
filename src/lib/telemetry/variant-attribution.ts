/**
 * Resolve a persisted exposure only from the authoritative assignment returned
 * by Flagsmith. Do not accept a browser-provided variant key as a fallback.
 */
export function resolveExposureVariant<T extends { key: string }>(
  variants: readonly T[],
  authoritativeVariantKey: string | null | undefined
): T | null {
  if (typeof authoritativeVariantKey !== "string" || !authoritativeVariantKey.trim()) {
    return null;
  }

  return variants.find((variant) => variant.key === authoritativeVariantKey.trim()) ?? null;
}
