# Legal Document Modal Implementation

## Overview

Legal documents (Terms of Service and Privacy Policy) are now displayed in modal dialogs instead of navigating to separate pages. This keeps users on the terms acceptance page for a better user experience.

## Changes Made

### 1. Created Modal Component
**File:** `/components/LegalDocumentModal.tsx`

- Reusable modal component for displaying legal documents
- Uses shadcn/ui Dialog component
- Scrollable content area with fixed header and footer
- Close button in header and footer
- Responsive design (max-width: 4xl, max-height: 90vh)

### 2. Extracted Document Content
**File:** `/lib/legalDocuments.ts`

- Exported `TERMS_OF_SERVICE` constant with full Terms of Service text
- Exported `PRIVACY_POLICY` constant with full Privacy Policy text
- Content extracted from markdown files in `/documents/` folder
- Maintains all formatting and structure

### 3. Updated Terms Acceptance Form
**File:** `/components/TermsAcceptanceForm.tsx`

**Changes:**
- Added modal state management (`showTermsModal`, `showPrivacyModal`)
- Replaced `<a>` links with `<button>` elements that trigger modals
- Changed icon from `ExternalLink` to `FileText`
- Updated checkbox labels to use buttons instead of links
- Added two `<LegalDocumentModal>` components at bottom of form

## User Experience

### Before
- Clicking document cards → Navigates to `/legal/terms` or `/legal/privacy`
- Opens in new tab
- User leaves terms acceptance page
- Must return to complete acceptance

### After
- Clicking document cards → Opens modal overlay
- Content displayed inline
- User stays on terms acceptance page
- Can close modal and immediately check boxes
- Smoother, faster workflow

## UI Flow

```
┌─────────────────────────────────────┐
│  Terms Acceptance Page              │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ [Terms of Service] 📄         │ │ ← Click opens modal
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ [Privacy Policy] 📄           │ │ ← Click opens modal
│  └───────────────────────────────┘ │
│                                     │
│  ☐ I agree to Terms of Service     │ ← Click "Terms" opens modal
│  ☐ I agree to Privacy Policy       │ ← Click "Privacy" opens modal
└─────────────────────────────────────┘

When modal opens:
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │ Terms of Service            [X] │ │ ← Header with close
│ ├─────────────────────────────────┤ │
│ │                                 │ │
│ │ # Terms of Service              │ │
│ │                                 │ │
│ │ ## 1. Acceptance of Terms       │ │ ← Scrollable content
│ │ ...                             │ │
│ │                                 │ │
│ ├─────────────────────────────────┤ │
│ │                    [Close]      │ │ ← Footer with button
│ └─────────────────────────────────┘ │
│         (backdrop overlay)          │
└─────────────────────────────────────┘
```

## Technical Details

### Modal Component Props
```typescript
interface LegalDocumentModalProps {
  isOpen: boolean;        // Controls modal visibility
  onClose: () => void;    // Callback when modal closes
  title: string;          // Modal header title
  content: string;        // Markdown content to display
}
```

### State Management
```typescript
const [showTermsModal, setShowTermsModal] = useState(false);
const [showPrivacyModal, setShowPrivacyModal] = useState(false);
```

### Modal Triggers
```typescript
// Document card button
<button onClick={() => setShowTermsModal(true)}>
  Terms of Service
</button>

// Checkbox label link
<button onClick={(e) => {
  e.preventDefault();
  setShowTermsModal(true);
}}>
  Terms of Service
</button>
```

## Benefits

1. **Better UX** - Users don't leave the page
2. **Faster** - No page navigation/loading
3. **Clearer Intent** - Modal overlay focuses attention
4. **Mobile Friendly** - Works better on small screens
5. **Accessible** - Keyboard navigation and screen reader support
6. **Consistent** - Same UI pattern for both documents

## Files Modified

- ✅ `/components/LegalDocumentModal.tsx` (new)
- ✅ `/lib/legalDocuments.ts` (new)
- ✅ `/components/TermsAcceptanceForm.tsx` (updated)

## Files Unchanged

- `/documents/terms-of-service.md` (source of truth)
- `/documents/privacy-policy.md` (source of truth)
- `/app/legal/terms/page.tsx` (still accessible via direct URL)
- `/app/legal/privacy/page.tsx` (still accessible via direct URL)

## Testing

1. Visit `/auth/accept-terms?email=test@example.com&name=Test`
2. Click "Terms of Service" card → Modal opens
3. Scroll through content → Verify all content visible
4. Click "Close" or [X] → Modal closes
5. Click "Privacy Policy" card → Modal opens
6. Click backdrop outside modal → Modal closes
7. Click "Terms of Service" link in checkbox label → Modal opens
8. Press Escape key → Modal closes
9. Check both checkboxes → Button enables
10. Verify mobile responsiveness

## Accessibility

- ✅ Keyboard navigation (Tab, Escape)
- ✅ Focus management (traps focus in modal)
- ✅ ARIA attributes (dialog role, labels)
- ✅ Screen reader announcements
- ✅ Close on Escape key
- ✅ Close on backdrop click

## Future Enhancements

- Add "Accept" button in modal footer to check box automatically
- Track which sections user scrolled through
- Add "Print" button for legal documents
- Add "Download PDF" option
- Highlight search terms if user searches within modal
