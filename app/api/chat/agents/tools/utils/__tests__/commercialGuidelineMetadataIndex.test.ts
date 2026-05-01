import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  filterMetadataByQuery,
  loadMetadataIndex,
  loadDocumentContent,
  resetMetadataCache,
  type DocumentMetadata,
} from '../commercialGuidelineMetadataIndex'

const meta = (overrides: Partial<DocumentMetadata> = {}): DocumentMetadata => ({
  id: 'a',
  title: 'MRI Lumbar Spine',
  domain: 'spine',
  path: '/p/a.md',
  fileName: 'a.md',
  sourceGroup: 'plaintextspine',
  cptCodes: ['72148'],
  icd10Codes: ['M54.16'],
  procedures: ['mri lumbar spine'],
  aliases: ['lumbar mri'],
  relatedConditions: ['low back pain'],
  ...overrides,
})

describe('filterMetadataByQuery', () => {
  const all = [
    meta(),
    meta({ id: 'b', title: 'Cardiac Cath', domain: 'cardio', cptCodes: ['93458'], icd10Codes: ['I25.10'], procedures: ['cardiac catheterization'], aliases: [], relatedConditions: ['chest pain'] }),
  ]

  it('filters by domain', () => {
    const r = filterMetadataByQuery(all, { domain: 'cardio' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('b')
  })

  it('filters by CPT', () => {
    const r = filterMetadataByQuery(all, { cpt: '72148' })
    expect(r.map((m) => m.id)).toEqual(['a'])
  })

  it('filters by multiple CPT codes (comma-separated)', () => {
    const r = filterMetadataByQuery(all, { cpt: '72148, 93458' })
    expect(r.map((m) => m.id).sort()).toEqual(['a', 'b'])
  })

  it('filters by ICD-10', () => {
    const r = filterMetadataByQuery(all, { icd10: 'I25.10' })
    expect(r.map((m) => m.id)).toEqual(['b'])
  })

  it('filters by treatment matching procedures and aliases', () => {
    const r = filterMetadataByQuery(all, { treatment: 'lumbar' })
    expect(r.map((m) => m.id)).toContain('a')
  })

  it('filters by diagnosis matching relatedConditions', () => {
    const r = filterMetadataByQuery(all, { diagnosis: 'chest pain' })
    expect(r.map((m) => m.id)).toEqual(['b'])
  })

  it('returns all when no filters supplied', () => {
    const r = filterMetadataByQuery(all, {})
    expect(r).toHaveLength(2)
  })

  it('returns empty for non-matching CPT', () => {
    const r = filterMetadataByQuery(all, { cpt: '00000' })
    expect(r).toHaveLength(0)
  })

  it('ignores blank cpt/icd10 strings', () => {
    const r = filterMetadataByQuery(all, { cpt: '   ', icd10: '' })
    expect(r).toHaveLength(2)
  })
})

describe('loadDocumentContent', () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-test-'))
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('strips front matter from markdown files', () => {
    const file = path.join(tmpDir, 'a.md')
    fs.writeFileSync(file, '---\ntitle: Hello\n---\n\nBody content here')
    const content = loadDocumentContent(file)
    expect(content.trim()).toBe('Body content here')
  })

  it('returns raw content for non-md files', () => {
    const file = path.join(tmpDir, 'a.txt')
    fs.writeFileSync(file, 'plain content')
    expect(loadDocumentContent(file)).toBe('plain content')
  })

  it('returns empty string for missing file', () => {
    expect(loadDocumentContent(path.join(tmpDir, 'nope.md'))).toBe('')
  })
})

describe('loadMetadataIndex', () => {
  let tmpRoot: string
  let cwdSpy: jest.SpyInstance

  beforeEach(() => {
    resetMetadataCache()
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-root-'))
    const dataDir = path.join(tmpRoot, 'app', 'api', 'data', 'plaintextspine')
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(
      path.join(dataDir, 'mri-lumbar.md'),
      `---
title: MRI Lumbar
specialty: orthopedic
procedures:
  - mri lumbar
aliases: lumbar mri
related_conditions:
  - low back pain
cpt_codes: ['72148']
icd10_codes:
  - M54.16
keywords: ['mri', 'lumbar']
priority: high
---
Body content`
    )
    fs.writeFileSync(
      path.join(dataDir, 'plain.txt'),
      'no front matter, just text'
    )
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpRoot)
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    fs.rmSync(tmpRoot, { recursive: true, force: true })
    resetMetadataCache()
  })

  it('scans the data directory and extracts metadata', () => {
    const index = loadMetadataIndex()
    expect(index.length).toBe(2)

    const md = index.find((m) => m.fileName === 'mri-lumbar.md')!
    expect(md).toBeDefined()
    expect(md.title).toBe('MRI Lumbar')
    expect(md.specialty).toEqual(['orthopedic'])
    expect(md.procedures).toEqual(['mri lumbar'])
    expect(md.aliases).toEqual(['lumbar mri'])
    expect(md.relatedConditions).toEqual(['low back pain'])
    expect(md.cptCodes).toEqual(['72148'])
    expect(md.icd10Codes).toEqual(['M54.16'])
    expect(md.keywords).toEqual(['mri', 'lumbar'])
    expect(md.priority).toBe('high')
    expect(md.sourceGroup).toBe('plaintextspine')
  })

  it('returns cached results on second call', () => {
    const first = loadMetadataIndex()
    const second = loadMetadataIndex()
    expect(second).toBe(first)
  })
})
