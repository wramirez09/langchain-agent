# AI Subscription Agreement Integration

## Overview

Added the AI Subscription Agreement as a third legal document that users must accept before proceeding to payment. This comprehensive agreement covers service usage, AI-specific terms, and subscription conditions.

## Changes Made

### 1. Created Markdown Document
**File:** `/documents/ai-subscription-agreement.md`

Complete AI Subscription Agreement including:
- Definitions (Affiliates, Services, Software, Users, etc.)
- Use of Services (Access, Subscriptions, Usage Limits)
- Customer Responsibilities
- Payment Terms
- Confidentiality and Security
- Warranties and Disclaimers
- Mutual Indemnification
- Limitations of Liability
- **AI Supplemental Terms** (High Risk Use, Inputs/Outputs, Use Restrictions)
- General provisions

### 2. Added to Legal Documents Library
**File:** `/lib/legalDocuments.ts`

- Exported `AI_SUBSCRIPTION_AGREEMENT` constant
- Contains abbreviated version with reference to full document
- Available for modal display

### 3. Updated Terms Acceptance Form
**File:** `/components/TermsAcceptanceForm.tsx`

**Added:**
- Third checkbox state: `aiAgreementAccepted`
- Third modal state: `showAiAgreementModal`
- Updated `allAccepted` logic to require all three checkboxes
- Third document card button
- Third checkbox with label
- Third modal component

**Updated:**
- Error message: "Please accept all three agreements to continue"
- Validation now requires Terms + Privacy + AI Agreement

## User Experience

### Document Cards
```
┌─────────────────────────────────┐
│ Terms of Service            📄  │
│ Review our terms and conditions │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Privacy Policy              📄  │
│ Learn how we protect your data  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ AI Subscription Agreement   📄  │  ← NEW
│ Review our AI service terms     │
└─────────────────────────────────┘
```

### Checkboxes
```
☐ I have read and agree to the Terms of Service
☐ I have read and agree to the Privacy Policy
☐ I have read and agree to the AI Subscription Agreement  ← NEW
```

### Requirements
- **All three checkboxes must be checked** to enable "Continue to Payment"
- Each document can be viewed in a modal
- Links in checkbox labels also open modals

## AI Subscription Agreement Highlights

### Key Sections

1. **Definitions** - Clear definitions of Services, Software, Users, Customer Data
2. **Usage Limits** - Restrictions on access, sharing, and modifications
3. **Payment Terms** - Subscription fees, invoicing, late payments, taxes
4. **Confidentiality** - Protection of Customer Data and AI's intellectual property
5. **AI Supplemental Terms** - Special provisions for AI features:
   - **High Risk Use** - Prohibited uses that could impact safety or rights
   - **Unacceptable Risk Use** - Uses that could cause discrimination or harm
   - **Inputs and Outputs** - Ownership and usage rights
   - **Use Restrictions** - What customers cannot do with AI features
   - **Warranty Disclaimer** - AI features provided "as is"

### Important AI-Specific Provisions

**High Risk Use** - Prohibited:
- Uses that significantly impact operations or reputation
- Uses affecting intellectual property or data security
- Uses impacting employees, users, or public
- Novel or significant legal/compliance risks

**Unacceptable Risk Use** - Prohibited:
- Affecting employment access or individual rights
- Leading to bias or discrimination
- Causing errors impacting safety or fundamental rights

**Customer Responsibilities:**
- Check and validate all AI outputs
- Ensure outputs are fit for purpose
- Comply with applicable laws
- Disclose when content is AI-generated

## Files Modified

- ✅ `/documents/ai-subscription-agreement.md` (new - full document)
- ✅ `/lib/legalDocuments.ts` (updated - added export)
- ✅ `/components/TermsAcceptanceForm.tsx` (updated - third checkbox)

## Testing

1. Visit `/auth/accept-terms?email=test@example.com&name=Test`
2. Verify three document cards are visible
3. Click "AI Subscription Agreement" card → Modal opens
4. Verify content displays correctly
5. Close modal
6. Try to click "Continue to Payment" → Should be disabled
7. Check Terms checkbox → Button still disabled
8. Check Privacy checkbox → Button still disabled
9. Check AI Agreement checkbox → Button becomes enabled
10. Uncheck any checkbox → Button becomes disabled again
11. Check all three → Button enabled
12. Click "Continue to Payment" → Proceeds to Stripe

## Legal Compliance

### Why This Matters

The AI Subscription Agreement provides:
- **Clear Terms** for AI service usage
- **Risk Mitigation** through use restrictions
- **Liability Protection** with disclaimers
- **Compliance** with AI regulations (EU AI Act references)
- **Customer Obligations** for responsible AI use

### Key Protections

1. **For the Company:**
   - Limits liability for AI outputs
   - Protects intellectual property
   - Defines acceptable use
   - Disclaims warranties for AI features

2. **For the Customer:**
   - Clear usage rights
   - Data ownership clarity
   - Defined service levels
   - Refund policy (10-day window)

## Integration with Payment Flow

The AI Subscription Agreement is now part of the terms acceptance stored in Stripe customer metadata:

```javascript
// When user accepts all three agreements
metadata: {
  terms_accepted: 'true',
  terms_accepted_at: '2026-04-11T...'
}
```

The `term_of_agreement` column in the `profiles` table tracks acceptance of **all three documents** collectively.

## Future Enhancements

- Track individual document acceptance separately
- Add version tracking for each document
- Implement re-acceptance flow when documents are updated
- Add "Download PDF" option for each document
- Create audit trail of acceptance events

## Summary

✅ AI Subscription Agreement created and integrated  
✅ Three separate checkboxes required  
✅ All documents display in modals  
✅ Payment blocked until all three accepted  
✅ Comprehensive AI-specific terms included  
✅ Compliance with AI regulations addressed  

Users must now accept Terms of Service, Privacy Policy, **and** AI Subscription Agreement before proceeding to payment.
