import { render, screen } from '@testing-library/react'
import {
  ARTIFACT_JSON_EXAMPLE,
  type PriorAuthArtifact,
} from '@/lib/priorAuth/artifactSchema'
import {
  Header,
  RequestOverviewCard,
  ClinicalContextCard,
  PaRequiredCard,
  MedicarePoliciesCard,
  CriteriaCard,
  CodesCard,
  DocumentationCard,
  LimitationsCard,
  SummaryCard,
  DisclaimerBlock,
} from '@/components/prior-auth/artifact/ArtifactSections'

const artifact = JSON.parse(ARTIFACT_JSON_EXAMPLE) as PriorAuthArtifact

describe('Header', () => {
  it('renders the title, determination pill, guideline + CPT chips', () => {
    render(<Header data={artifact} />)
    expect(
      screen.getByText('Prior Authorization Summary for MRI of the Knee'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Conditional — additional documentation needed'),
    ).toBeInTheDocument()
    expect(screen.getByText('Medicare')).toBeInTheDocument()
    // primaryCpt falls back to the first suggested CPT when none supplied
    expect(screen.getByText('73721')).toBeInTheDocument()
  })

  it('renders a PHI notice when present', () => {
    render(<Header data={{ ...artifact, phiNotice: 'PHI was removed.' }} />)
    expect(screen.getByText('PHI was removed.')).toBeInTheDocument()
  })
})

describe('RequestOverviewCard', () => {
  it('renders treatment, diagnosis and suggested code options', () => {
    render(<RequestOverviewCard index={1} ov={artifact.requestOverview} />)
    expect(
      screen.getByText('Magnetic Resonance Imaging (MRI) of the knee'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Knee pain for more than 4 weeks'),
    ).toBeInTheDocument()
    expect(screen.getByText('Likely CPT / HCPCS options')).toBeInTheDocument()
    // user supplied no codes
    expect(screen.getAllByText('Not provided').length).toBeGreaterThan(0)
  })

  it('renders nothing when overview is absent', () => {
    const { container } = render(<RequestOverviewCard index={1} ov={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ClinicalContextCard', () => {
  it('renders medical history and key findings as blue-ring bullets', () => {
    const { container } = render(
      <ClinicalContextCard index={2} ov={artifact.requestOverview} />,
    )
    expect(screen.getByText('Medical History')).toBeInTheDocument()
    expect(
      screen.getByText('Knee pain duration greater than 4 weeks'),
    ).toBeInTheDocument()
    const ring = container.querySelector('li span.absolute')
    expect(ring).toHaveClass('border-[#238dd2]', 'bg-[#dbe6fe]')
  })

  it('renders nothing without history or findings', () => {
    const { container } = render(
      <ClinicalContextCard index={2} ov={{ medicalHistory: '', keyFindings: [] }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PaRequiredCard', () => {
  it('shows the mapped label for each decision', () => {
    const { rerender } = render(<PaRequiredCard index={3} value="CONDITIONAL" />)
    expect(screen.getByText('Conditional')).toBeInTheDocument()
    rerender(<PaRequiredCard index={3} value="NO" />)
    expect(screen.getByText('Not required')).toBeInTheDocument()
    rerender(<PaRequiredCard index={3} value="YES" />)
    expect(screen.getByText('Required')).toBeInTheDocument()
  })

  it('renders the rationale when supplied', () => {
    render(<PaRequiredCard index={3} value="CONDITIONAL" rationale="Because reasons." />)
    expect(screen.getByText('Because reasons.')).toBeInTheDocument()
  })
})

describe('MedicarePoliciesCard', () => {
  it('groups policies under NCD/LCD section titles', () => {
    render(<MedicarePoliciesCard index={4} policies={artifact.medicarePolicies} />)
    expect(
      screen.getByText('National Coverage Determinations (NCD)'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Local Coverage Determinations (LCD)'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Magnetic Resonance Imaging (NCD 220.2)'),
    ).toBeInTheDocument()
  })

  it('renders nothing when there are no policies', () => {
    const { container } = render(<MedicarePoliciesCard index={4} policies={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CriteriaCard', () => {
  it('renders criterion titles', () => {
    render(<CriteriaCard index={5} criteria={artifact.medicalNecessityCriteria} />)
    expect(
      screen.getByText('Persistent pain after conservative management'),
    ).toBeInTheDocument()
  })
})

describe('CodesCard', () => {
  it('renders ICD-10 and CPT tables', () => {
    render(<CodesCard index={6} codes={artifact.relevantCodes} />)
    expect(screen.getByText('M25.561')).toBeInTheDocument()
    expect(screen.getByText('Pain in right knee')).toBeInTheDocument()
    expect(screen.getByText('CPT / HCPCS')).toBeInTheDocument()
  })

  it('renders nothing when codes are absent', () => {
    const { container } = render(<CodesCard index={6} codes={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('SummaryCard', () => {
  it('renders the determination label, rationale and strengthen items', () => {
    render(<SummaryCard index={8} summary={artifact.summary} />)
    expect(
      screen.getByText('Conditional — additional documentation needed'),
    ).toBeInTheDocument()
    expect(screen.getByText('To strengthen the request')).toBeInTheDocument()
    expect(
      screen.getByText('Knee pain duration and laterality'),
    ).toBeInTheDocument()
  })

  it('renders nothing when summary is absent', () => {
    const { container } = render(<SummaryCard index={8} summary={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('DisclaimerBlock', () => {
  it('renders the supplied disclaimer plus the standing verify notice', () => {
    render(<DisclaimerBlock disclaimer="Guidance only." />)
    expect(screen.getByText('Guidance only.')).toBeInTheDocument()
    expect(
      screen.getByText(/Always verify with payer portal guidelines/),
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Section header / bullet theming (the recently changed danger/success themes)
// ---------------------------------------------------------------------------

describe('SectionCard theming', () => {
  it('renders the Limitations card with a red (danger) header, black index and red rings', () => {
    const { container } = render(
      <LimitationsCard
        index={7}
        items={['No coverage for cosmetic indications']}
      />,
    )
    expect(screen.getByText('Limitations & Exclusions')).toHaveClass(
      'text-[#dc2626]',
    )
    expect(screen.getByText('07')).toHaveClass('text-[#0f172a]')
    const ring = container.querySelector('li span.absolute')
    expect(ring).toHaveClass('border-[#dc2626]', 'bg-[#fee2e2]')
  })

  it('renders the Required Documentation card with a green (success) header and black index', () => {
    render(
      <DocumentationCard
        index={6}
        groups={[{ title: 'Imaging', items: [{ item: 'MRI report' }] }]}
      />,
    )
    expect(screen.getByText('Required Documentation')).toHaveClass(
      'text-[#15803d]',
    )
    expect(screen.getByText('06')).toHaveClass('text-[#0f172a]')
    expect(screen.getByText('Imaging')).toBeInTheDocument()
    expect(screen.getByText('MRI report')).toBeInTheDocument()
  })

  it('renders a neutral card with a muted header and blue index', () => {
    render(<RequestOverviewCard index={1} ov={artifact.requestOverview} />)
    expect(screen.getByText('Request Overview')).toHaveClass('text-[#64748b]')
    expect(screen.getByText('01')).toHaveClass('text-[#238dd2]')
  })
})
