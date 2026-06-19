/**
 * Pure colour resolution for the PDF artifact's section theming, factored out of
 * ArtifactPdfDoc.tsx so it can be unit-tested without importing
 * @react-pdf/renderer (which ships ESM-only and is not transformed by Jest).
 *
 * Mirrors the web theming in
 * components/prior-auth/artifact/ArtifactSections.tsx: a "danger" section (e.g.
 * Limitations & Exclusions) gets a red header, a "success" section (e.g.
 * Required Documentation) a green header, and both render a black index number;
 * neutral sections keep the muted header + blue index.
 */

export const PDF_INK = "#0f172a";
export const PDF_BLUE = "#238dd2";
export const PDF_MUTED = "#64748b";
export const PDF_DANGER = "#dc2626";
export const PDF_SUCCESS = "#15803d";

export interface SectionThemeFlags {
  danger?: boolean;
  success?: boolean;
}

/** Header title colour: red for danger, green for success, muted otherwise. */
export function pdfSectionTitleColor({ danger, success }: SectionThemeFlags): string {
  if (danger) return PDF_DANGER;
  if (success) return PDF_SUCCESS;
  return PDF_MUTED;
}

/** Index-number colour: black when a theme is active, blue otherwise. */
export function pdfSectionIndexColor({ danger, success }: SectionThemeFlags): string {
  return danger || success ? PDF_INK : PDF_BLUE;
}

/** Ring-bullet border/fill colours: red for the danger tone, blue otherwise. */
export function pdfRingColors(tone: "blue" | "danger"): {
  border: string;
  background: string;
} {
  return tone === "danger"
    ? { border: PDF_DANGER, background: "#fee2e2" }
    : { border: PDF_BLUE, background: "#dbe6fe" };
}
