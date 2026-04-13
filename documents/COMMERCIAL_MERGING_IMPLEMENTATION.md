# Commercial Guidelines Multi-File Content Merging Implementation

## Overview

Implemented intelligent content merging for commercial guideline searches to ensure that when multiple files contain overlapping information about the same topic (e.g., MRI procedures across different folders), all relevant content is combined into comprehensive results.

## Implementation Date
April 12, 2026

## Problem Solved

**Before:** When querying for treatments like "MRI" that had relevant information spread across multiple files in different folders (e.g., `imaging/` and `cardio/`), the system would:
- Score each file independently
- Return them as separate results
- Risk the agent only using the top-scoring file
- Potentially miss important information from lower-ranked but still relevant files

**After:** The system now:
- Detects documents with overlapping content
- Merges them into single comprehensive results
- Combines all CPT codes, ICD-10 codes, and content
- Boosts merged document scores to reflect their comprehensive nature
- Ensures all relevant information is presented together

## Files Modified

### 1. `app/api/chat/agents/tools/utils/commercialGuidelineTypes.ts`
**Changes:**
- Added `MergedSourceInfo` interface to track source documents in merged results
- Updated `ScoredResult` interface to include:
  - `mergedFrom?: MergedSourceInfo[]` - tracks which documents were merged
  - `body?: string` - full combined body content for merged documents

### 2. `app/api/chat/agents/tools/utils/scoreCommercialGuideline.ts`
**Changes:**
- Removed duplicate `ScoredResult` interface, now imports from types file
- Added `documentsOverlap()` function to detect overlapping documents based on:
  - Shared CPT codes (exact match)
  - Shared ICD-10 codes (exact match)
  - High treatment similarity (>70% keyword overlap)
  - High title similarity (>70% keyword overlap)
- Added `detectOverlappingDocuments()` function to group overlapping documents
- Added `mergeDocuments()` function to combine overlapping documents:
  - Uses highest-scoring document as base
  - Combines all CPT and ICD-10 codes
  - Merges all match signals
  - Calculates merged score: `maxScore + (numSources - 1) * 2`
  - Concatenates document bodies with `---` separators
  - Tracks source documents in `mergedFrom` field
- Updated `scoreAndRankDocuments()` to:
  - Accept optional `enableMerging` parameter (default: `true`)
  - Detect overlapping documents after initial scoring
  - Merge overlapping documents
  - Re-sort results by score after merging
  - Log merging activity for debugging

### 3. `app/api/chat/agents/tools/CommercialGuidelineSearchTool.ts`
**Changes:**
- Updated class documentation to mention automatic merging feature
- Updated tool description to inform the agent about:
  - Automatic merging of overlapping documents
  - Merge criteria (same CPT/ICD-10 or >70% treatment similarity)
  - Bonus scoring for merged documents (+2 per additional source)

## How It Works

### Overlap Detection Criteria
Two documents are considered overlapping if they meet **any** of:
1. Share at least 1 CPT code (exact match)
2. Share at least 1 ICD-10 code (exact match)
3. Treatment name keyword overlap > 70%
4. Title keyword overlap > 70%

### Merging Process
1. **Score all documents** individually using existing scoring logic
2. **Detect overlapping groups** by comparing all scored documents
3. **Merge each group**:
   - Combine all CPT codes (deduplicated)
   - Combine all ICD-10 codes (deduplicated, uppercase normalized)
   - Combine all match signals
   - Calculate merged score: highest individual score + 2 points per additional source
   - Concatenate document bodies with `\n\n---\n\n` separators
   - Create title: `{baseTitle} ({numSources} sources)`
4. **Replace individual documents** with merged versions
5. **Re-sort** all results by score

### Content Format
When documents are merged, their bodies are concatenated as:
```
[Content from Document 1]

---

[Content from Document 2]

---

[Content from Document 3]
```

This preserves all information while maintaining clear separation between sources.

## Benefits

1. **Comprehensive Coverage**: All relevant information from multiple files is included in a single result
2. **No Information Loss**: Lower-ranked but relevant files are no longer missed
3. **Better Agent Responses**: Agent receives complete information in one place, leading to more accurate analyses
4. **Higher Relevance Scores**: Merged documents get bonus points, ensuring they rank highly
5. **Maintains Confidentiality**: Merged results still don't expose source file names to users
6. **Backward Compatible**: Merging can be disabled by passing `enableMerging: false` to `scoreAndRankDocuments()`

## Example Scenarios

### Scenario 1: MRI Procedures
**Query:** "MRI lumbar spine authorization requirements"
- **Before:** Might find `imaging/mri-spine.md` (score: 25) and `cardio/cardiac-mri.md` (score: 15) as separate results
- **After:** If both files share CPT codes or have similar treatment names, they're merged into one result with score 27 (25 + 2 bonus)

### Scenario 2: Cardiac Procedures
**Query:** "Cardiac catheterization prior auth"
- **Before:** Files in `cardio/` and `imaging-surgery-cardiac-sleep-proton/` folders treated separately
- **After:** Files with shared CPT codes (e.g., 93451, 93452) are automatically merged, providing comprehensive criteria from all sources

### Scenario 3: Genetic Testing
**Query:** "BRCA genetic testing authorization"
- **Before:** Multiple genetic testing files might be ranked separately
- **After:** Files with overlapping ICD-10 codes or high title similarity are merged, ensuring all relevant criteria are included

## Testing Recommendations

To verify the implementation works correctly, test with queries that should trigger merging:

1. **MRI queries** - Should merge files from imaging + other specialty folders
2. **Cardiac procedures** - Should merge cardio + imaging-surgery-cardiac-sleep-proton
3. **Genetic testing** - Should merge multiple related genetic test files
4. **Specific CPT codes** - Should merge all files containing that code

Check logs for:
- `[ScoreEngine] Detected N groups of overlapping documents`
- `[ScoreEngine] Merging N documents: [titles]`
- `[ScoreEngine] After merging: N documents (X merged, Y standalone)`

## Configuration

Merging is enabled by default. To disable for testing or specific use cases:

```typescript
const { topMatches, relatedMatches } = scoreAndRankDocuments(
  docs, 
  input, 
  false // disable merging
);
```

## Performance Impact

- **Minimal overhead**: Overlap detection is O(n²) but only runs on relevant documents (typically < 20)
- **No additional I/O**: Document bodies are already loaded during initial scoring
- **Faster agent processing**: Agent receives comprehensive results in fewer documents, reducing synthesis time

## Future Enhancements

Potential improvements for future iterations:

1. **Configurable overlap threshold**: Allow adjusting the 70% similarity threshold
2. **Smart excerpt generation**: Create better excerpts for merged documents
3. **Section-aware merging**: Preserve document structure when merging (e.g., separate criteria, documentation sections)
4. **Merge analytics**: Track which documents are frequently merged to identify potential consolidation opportunities
5. **User-facing merge indicators**: Optionally show users when results are merged (while maintaining confidentiality)
