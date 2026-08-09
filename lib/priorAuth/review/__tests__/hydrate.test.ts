import {
  buildEvidenceIndex,
  corpusIdOf,
  hydrateSourceBodies,
  rankedCommercialSources,
  type BodyFetcher,
} from '../evidence'
import { reviewArtifact } from '../../reviewArtifact'
import {
  commercialMatch,
  commercialOutput,
  makeArtifact,
  medicareDetail,
} from '../../__fixtures__/artifact'

const focused = () =>
  commercialMatch({
    id: 'muscle/cervical-laminectomy.md',
    title: 'Cervical Laminectomy',
    score: 0.95,
    procedures: ['cervical laminectomy'],
  })

const rival = () =>
  commercialMatch({
    id: 'muscle/lumbar-laminectomy.md',
    title: 'Lumbar Laminectomy',
    score: 0.7,
    procedures: ['lumbar laminectomy'],
  })

const third = () =>
  commercialMatch({
    id: 'muscle/acdf.md',
    title: 'ACDF',
    score: 0.5,
    procedures: ['acdf'],
  })

describe('corpusIdOf', () => {
  it('strips the commercial prefix', () => {
    expect(corpusIdOf('cgs:muscle/cervical-laminectomy.md')).toBe(
      'muscle/cervical-laminectomy.md',
    )
  })

  it('returns null for sources that are not corpus documents', () => {
    expect(corpusIdOf('mpd:lcd:L34567:3')).toBeNull()
    expect(corpusIdOf('pce:https://example.test/policy')).toBeNull()
    expect(corpusIdOf('cgs:')).toBeNull()
  })
})

describe('rankedCommercialSources', () => {
  it('puts top matches before related ones, then orders by score', () => {
    const ev = buildEvidenceIndex([commercialOutput([rival(), focused()], [third()])])
    expect(rankedCommercialSources(ev, 3).map((s) => s.title)).toEqual([
      'Cervical Laminectomy',
      'Lumbar Laminectomy',
      'ACDF',
    ])
  })

  it('honours the limit', () => {
    const ev = buildEvidenceIndex([commercialOutput([focused(), rival(), third()])])
    expect(rankedCommercialSources(ev, 2)).toHaveLength(2)
    expect(rankedCommercialSources(ev, 0)).toEqual([])
  })

  it('never offers a Medicare policy — it is not in this corpus', () => {
    const ev = buildEvidenceIndex([medicareDetail(), commercialOutput([focused()])])
    expect(rankedCommercialSources(ev, 5).map((s) => s.title)).toEqual([
      'Cervical Laminectomy',
    ])
  })
})

describe('hydrateSourceBodies', () => {
  it('attaches full text to the top two sources only', async () => {
    const ev = buildEvidenceIndex([commercialOutput([focused(), rival(), third()])])
    const asked: string[][] = []
    const fetcher: BodyFetcher = async (ids) => {
      asked.push([...ids])
      return new Map(ids.map((id) => [id, `full body of ${id}`]))
    }

    const res = await hydrateSourceBodies(ev, fetcher, { limit: 2 })

    expect(res).toEqual({ hydrated: 2 })
    expect(asked[0]).toEqual([
      'muscle/cervical-laminectomy.md',
      'muscle/lumbar-laminectomy.md',
    ])
    const byTitle = (t: string) =>
      [...ev.sources.values()].find((s) => s.title === t)
    expect(byTitle('Cervical Laminectomy')?.body).toContain('full body of')
    expect(byTitle('ACDF')?.body).toBeUndefined()
  })

  it('does not call the fetcher when there is nothing to read', async () => {
    const ev = buildEvidenceIndex([medicareDetail()])
    const fetcher = jest.fn()
    expect(await hydrateSourceBodies(ev, fetcher as unknown as BodyFetcher)).toEqual({
      hydrated: 0,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports a fetch that fails without throwing', async () => {
    const ev = buildEvidenceIndex([commercialOutput([focused()])])
    const res = await hydrateSourceBodies(ev, async () => {
      throw new Error('database down')
    })

    expect(res.failed).toBe(true)
    expect(res.hydrated).toBe(0)
    expect([...ev.sources.values()][0].body).toBeUndefined()
  })

  it('gives up rather than holding the answer', async () => {
    const ev = buildEvidenceIndex([commercialOutput([focused()])])
    const res = await hydrateSourceBodies(
      ev,
      () => new Promise(() => {}),
      { timeoutMs: 20 },
    )
    expect(res.failed).toBe(true)
  })

  it('leaves a source alone when the corpus has no text for it', async () => {
    const ev = buildEvidenceIndex([commercialOutput([focused()])])
    const res = await hydrateSourceBodies(ev, async () => new Map([['other.md', 'x']]))

    expect(res.hydrated).toBe(0)
    expect(res.failed).toBeUndefined()
    expect([...ev.sources.values()][0].body).toBeUndefined()
  })
})

describe('reviewArtifact — body hydration', () => {
  it('reads source bodies before the checks run', async () => {
    const evidence = [commercialOutput([focused(), rival(), third()])]
    const seen: string[] = []

    await reviewArtifact(makeArtifact(), evidence, {
      mode: 'on',
      fetchBodies: async (ids) => {
        seen.push(...ids)
        return new Map(ids.map((id) => [id, 'body']))
      },
      checks: [
        {
          id: 'peek',
          title: 'peek',
          run: (ctx) => {
            const withBody = [...ctx.evidence.sources.values()].filter((s) => s.body)
            expect(withBody).toHaveLength(2)
            return []
          },
        },
      ],
    })

    expect(seen).toHaveLength(2)
  })

  it('still reviews when the corpus cannot be read', async () => {
    const out = await reviewArtifact(makeArtifact(), [commercialOutput([focused()])], {
      mode: 'on',
      fetchBodies: async () => {
        throw new Error('down')
      },
    })

    expect(out.failed).toBeUndefined()
    expect(out.review.checks.length).toBeGreaterThan(0)
  })
})
