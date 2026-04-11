# Testing Guide: Terms Acceptance Flow

## Quick Test Steps

### 1. Test Legal Document Pages

Visit these URLs to verify the legal pages render correctly:

```
http://localhost:3000/legal/terms
http://localhost:3000/legal/privacy
```

**Expected**:
- ✅ Markdown content displays properly
- ✅ "Back to Home" button works
- ✅ Contact email links are clickable
- ✅ Page is responsive on mobile

### 2. Test Footer Links

Visit any page and scroll to the bottom:

```
http://localhost:3000/
http://localhost:3000/agents
```

**Expected**:
- ✅ Footer appears at bottom of page
- ✅ "Terms of Service" link → `/legal/terms`
- ✅ "Privacy Policy" link → `/legal/privacy`
- ✅ "Contact" link opens email client
- ✅ Footer is responsive on mobile

### 3. Test Signup Flow (Full Journey)

#### Step 1: Start Signup
```
http://localhost:3000/auth/sign-up
```

**Actions**:
1. Enter name: "Test User"
2. Enter email: "test@example.com"
3. Click "Subscribe" button

**Expected**:
- ✅ Redirects to `/auth/accept-terms?email=test@example.com&name=Test+User`

#### Step 2: Terms Acceptance Page
```
http://localhost:3000/auth/accept-terms
```

**Expected**:
- ✅ Page shows "Accept Terms & Privacy Policy" heading
- ✅ Amber warning box displays
- ✅ Two document cards show (Terms of Service, Privacy Policy)
- ✅ External link icons visible
- ✅ Checkbox is unchecked by default
- ✅ "Continue to Payment" button is DISABLED

**Actions**:
1. Click "Terms of Service" card → Opens in new tab
2. Click "Privacy Policy" card → Opens in new tab
3. Click checkbox "I have read and agree..."

**Expected**:
- ✅ Checkbox becomes checked
- ✅ "Continue to Payment" button becomes ENABLED

**Actions**:
4. Click "Continue to Payment"

**Expected**:
- ✅ Shows loading spinner
- ✅ API call to `/api/accept-terms` succeeds
- ✅ Success toast appears
- ✅ Redirects to Stripe checkout page

### 4. Test Database Update

After accepting terms, check the database:

```sql
SELECT email, term_of_agreement, updated_at 
FROM profiles 
WHERE email = 'test@example.com';
```

**Expected**:
- ✅ `term_of_agreement` = `true`
- ✅ `updated_at` is recent timestamp

### 5. Test Server-Side Validation

Try to bypass the terms acceptance:

**Method 1**: Direct API call without acceptance
```bash
curl -X POST http://localhost:3000/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@example.com","name":"New User"}'
```

**Expected**:
- ✅ Returns 403 error
- ✅ Error message: "Terms of service must be accepted before proceeding to payment"

**Method 2**: Try with accepted terms
```bash
# First accept terms via the UI or API
# Then try checkout

curl -X POST http://localhost:3000/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'
```

**Expected**:
- ✅ Returns 200 success
- ✅ Returns Stripe checkout URL

### 6. Test Edge Cases

#### Case 1: Missing URL Parameters
Visit directly without params:
```
http://localhost:3000/auth/accept-terms
```

**Expected**:
- ✅ Checks localStorage for email/name
- ✅ If not found, redirects to `/auth/sign-up`

#### Case 2: Unchecking Checkbox
1. Check the agreement checkbox
2. Uncheck it
3. Try to click "Continue to Payment"

**Expected**:
- ✅ Button becomes disabled again
- ✅ Cannot proceed without checkbox

#### Case 3: Go Back Button
1. On terms acceptance page
2. Click "Go Back" button

**Expected**:
- ✅ Returns to previous page (signup)

### 7. Test Mobile Responsiveness

Use browser DevTools to test mobile views:

**Devices to test**:
- iPhone SE (375px)
- iPhone 12 Pro (390px)
- iPad (768px)

**Pages to check**:
- `/legal/terms`
- `/legal/privacy`
- `/auth/accept-terms`

**Expected**:
- ✅ Text is readable without horizontal scroll
- ✅ Buttons stack vertically on mobile
- ✅ Footer adapts to single column
- ✅ Checkbox and labels are touch-friendly

### 8. Test Webhook Behavior

Simulate a Stripe webhook (after payment):

**Expected behavior**:
- ✅ When creating new profile, preserves `term_of_agreement = true`
- ✅ Doesn't overwrite existing term acceptance
- ✅ Sets `is_active = true` for paid users

## Common Issues & Solutions

### Issue: "Cannot read properties of null"
**Solution**: Make sure database column `term_of_agreement` exists

### Issue: Redirect loop
**Solution**: Clear localStorage and cookies, try again

### Issue: Footer not showing
**Solution**: Check that page has enough content or adjust layout height

### Issue: Checkbox not working
**Solution**: Verify `@/components/ui/checkbox` component exists

### Issue: Legal documents not rendering
**Solution**: Check that markdown files exist in `/documents/` folder

## Success Indicators

✅ All pages load without errors  
✅ Legal documents display correctly  
✅ Terms must be accepted before payment  
✅ Database updates correctly  
✅ Server-side validation works  
✅ Mobile responsive  
✅ Footer visible on all pages  

## Next Steps After Testing

1. **Customize legal documents** with your actual terms
2. **Update contact emails** in documents and footer
3. **Add your business address** to legal documents
4. **Test with real Stripe account** (not test mode)
5. **Monitor Supabase logs** for any errors
6. **Set up error tracking** (Sentry, LogRocket, etc.)

## Support

If tests fail, check:
1. Browser console for JavaScript errors
2. Network tab for failed API calls
3. Supabase logs for database errors
4. Terminal for Next.js build errors
