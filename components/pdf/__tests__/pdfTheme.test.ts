import {
  PDF_BLUE,
  PDF_DANGER,
  PDF_INK,
  PDF_MUTED,
  PDF_SUCCESS,
  pdfRingColors,
  pdfSectionIndexColor,
  pdfSectionTitleColor,
} from '../pdfTheme'

// These resolvers are the source of truth for the PDF artifact's section
// theming. They mirror the web theming (red Limitations header/rings, green
// Required Documentation header, black index numbers) asserted in
// components/prior-auth/__tests__/ArtifactSections.test.tsx. We test them
// directly because @react-pdf/renderer is ESM-only and not transformed by Jest,
// so the full PDF document module can't be imported under the test runner.

describe('pdfSectionTitleColor', () => {
  it('is red for a danger section (Limitations & Exclusions)', () => {
    expect(pdfSectionTitleColor({ danger: true })).toBe(PDF_DANGER)
  })

  it('is green for a success section (Required Documentation)', () => {
    expect(pdfSectionTitleColor({ success: true })).toBe(PDF_SUCCESS)
  })

  it('is muted for a neutral section', () => {
    expect(pdfSectionTitleColor({})).toBe(PDF_MUTED)
  })

  it('prefers danger over success when both are set', () => {
    expect(pdfSectionTitleColor({ danger: true, success: true })).toBe(PDF_DANGER)
  })
})

describe('pdfSectionIndexColor', () => {
  it('is black (ink) when a theme is active', () => {
    expect(pdfSectionIndexColor({ danger: true })).toBe(PDF_INK)
    expect(pdfSectionIndexColor({ success: true })).toBe(PDF_INK)
  })

  it('is blue for a neutral section', () => {
    expect(pdfSectionIndexColor({})).toBe(PDF_BLUE)
  })
})

describe('pdfRingColors', () => {
  it('returns red border/fill for the danger tone', () => {
    expect(pdfRingColors('danger')).toEqual({
      border: PDF_DANGER,
      background: '#fee2e2',
    })
  })

  it('returns blue border/fill for the default tone', () => {
    expect(pdfRingColors('blue')).toEqual({
      border: PDF_BLUE,
      background: '#dbe6fe',
    })
  })
})
