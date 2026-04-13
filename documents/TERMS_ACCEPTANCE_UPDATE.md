# Terms Acceptance Form Update

## Changes Made

### Separate Checkboxes
Updated the terms acceptance form to have **two separate checkboxes**:
1. ✅ Terms of Service checkbox
2. ✅ Privacy Policy checkbox

### Requirements
- **Both checkboxes must be checked** to enable the "Continue to Payment" button
- Each checkbox has its own label with a clickable link to the respective document
- Links open in new tabs and won't interfere with checkbox state

### User Experience
1. User sees two document cards at the top (clickable to open in new tab)
2. Below that, two separate checkboxes:
   - "I have read and agree to the Terms of Service"
   - "I have read and agree to the Privacy Policy"
3. "Continue to Payment" button is disabled until BOTH are checked
4. Error message if user tries to proceed without checking both

### Technical Implementation

**State Management:**
```typescript
const [termsAccepted, setTermsAccepted] = useState(false);
const [privacyAccepted, setPrivacyAccepted] = useState(false);
const allAccepted = termsAccepted && privacyAccepted;
```

**Validation:**
```typescript
if (!allAccepted) {
  toast.error('Please accept both the Terms of Service and Privacy Policy to continue');
  return;
}
```

**Button State:**
```typescript
disabled={!allAccepted || isLoading}
```

### UI Layout

```
┌─────────────────────────────────────────┐
│  ⚠️  Important: Review Before Accepting │
│  Please carefully review...             │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Legal Documents                        │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ Terms of Service              🔗  │ │
│  │ Review our terms and conditions   │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ Privacy Policy                🔗  │ │
│  │ Learn how we protect your data    │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  ☐ I have read and agree to the        │
│     Terms of Service                    │
│                                         │
│  ☐ I have read and agree to the        │
│     Privacy Policy                      │
└─────────────────────────────────────────┘

┌──────────┐  ┌────────────────────────┐
│ Go Back  │  │ Continue to Payment    │
└──────────┘  └────────────────────────┘
              (disabled until both checked)
```

### Benefits

1. **Clearer Intent** - Users explicitly agree to each document separately
2. **Better UX** - No ambiguity about what they're agreeing to
3. **Legal Compliance** - Separate acknowledgment of each legal document
4. **Accessibility** - Each checkbox has its own label and ID
5. **Link Functionality** - Document links work properly without affecting checkbox state

### Testing

To test the changes:
1. Visit `/auth/accept-terms?email=test@example.com&name=Test`
2. Verify both document cards are clickable and open in new tabs
3. Try clicking "Continue to Payment" without checking boxes → Should show error
4. Check only Terms checkbox → Button still disabled
5. Check only Privacy checkbox → Button still disabled
6. Check both checkboxes → Button becomes enabled
7. Click "Continue to Payment" → Should proceed to Stripe checkout

### Files Modified
- `/components/TermsAcceptanceForm.tsx` - Added separate checkbox states and validation
