# Commercial Guideline Doc Template & Authoring Checklist

Copy the front matter + section skeleton below when adding a procedure doc under
`app/api/data/<domain>/`. Run `yarn validate:guidelines` before committing — it
is the CI gate that catches the gaps documented here.

## Why these rules exist

The agent reproduces guideline criteria and codes from what the retrieval tool
surfaces. Three failure modes this template prevents:

1. **Borrowed docs.** A query with no dedicated doc matches a *sibling* procedure
   (e.g., a cervical *laminectomy* request matched the ACDF *fusion* doc) and
   inherits that procedure's codes. Mitigation: a focused doc per high-volume
   procedure, with `cpt_codes` scoped to the procedure class (a decompression
   doc must NOT carry fusion `22xxx` / bone-graft `2093x` codes).
2. **Missing presenting code.** Docs list *qualifying* codes (radiculopathy /
   myelopathy / stenosis) but omit the presenting pain code the request is
   usually filed under — cervical `M54.2`, thoracic `M54.6`, lumbar `M54.50`.
   The agent then can't surface the patient's own diagnosis code.
3. **Unlabeled codes.** A code in `cpt_codes` / `icd10_codes` has no
   `CODE — descriptor` line in the body, so the label pipeline can't attach a
   guideline-sourced descriptor. Every code should appear in a RELEVANT CODES
   block as `CODE — official title; brief description`.

## Front matter (required fields)

```yaml
---
title: "<Procedure Name>"                # required
domain: "<cardio|muscle|imaging|...>"    # required
specialty: ["...", "..."]
procedures: ["<canonical>", "..."]       # required — drives matching
aliases: ["...", "..."]
relatedConditions: ["...", "..."]
priority: "high"                          # high | medium | low
keywords: ["...", "..."]
cpt_codes: ["#####", "..."]              # required (except policy/coding/predictive-genetic docs)
icd10_codes: ["A##.#", "..."]            # required — INCLUDE the presenting pain code
---
```

## Body skeleton (required sections)

```
MEDICAL NECESSITY CRITERIA
<one-paragraph definition, then "considered medically necessary when ALL of the following...">

INDICATIONS
<objective findings; list every distinct qualifying scenario / special-population case>

CONSERVATIVE THERAPY (for non-urgent cases)
<state the duration AND recency window verbatim, e.g. "at least 6 weeks, generally
 completed within the 6 months preceding the request"; list active + additional
 modalities; list the urgent/red-flag bypass exceptions>

LEVEL SELECTION AND SCOPE        # spine docs — per-level + noncontiguous rationale

REQUIRED DOCUMENTATION
<imaging (with recency), neuro exam, a validated functional measure (e.g. NDI/ODI),
 conservative-care records, prior procedures and response, surgical plan>

LIMITATIONS AND EXCLUSIONS

RELEVANT CODES
-   CPT/HCPCS:
    -   ##### — official title; brief plain-language description.
-   ICD-10:
    -   A##.# — official title; brief description.   # lead with the presenting code
```

## Pre-commit checklist

- [ ] `yarn validate:guidelines` passes (0 errors).
- [ ] `icd10_codes` includes the presenting pain code for the region.
- [ ] `cpt_codes` are scoped to the procedure class (no fusion/graft codes in a decompression doc).
- [ ] Every metadata code that should be relayed appears as a `CODE — descriptor` line in RELEVANT CODES.
- [ ] Conservative-therapy duration + recency window are stated verbatim.
- [ ] Required Documentation names a validated functional measure (NDI/ODI) and prior-procedure history.

> Model-authored docs require SME review before they are relied upon clinically.
