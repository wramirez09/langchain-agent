# Database Migration: Terms of Agreement Column

## Required Database Change

Before the terms acceptance feature will work, you must add a new column to the `profiles` table in your Supabase database.

## Migration SQL

Run this SQL command in your Supabase SQL Editor:

```sql
-- Add term_of_agreement column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS term_of_agreement BOOLEAN DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.term_of_agreement IS 'Indicates whether user has accepted Terms of Service and Privacy Policy';
```

## How to Apply the Migration

### Option 1: Supabase Dashboard (Recommended)

1. Log in to your Supabase dashboard
2. Navigate to your project
3. Go to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Paste the SQL command above
6. Click **Run** or press `Cmd/Ctrl + Enter`
7. Verify the column was added by checking the **Table Editor** → **profiles** table

### Option 2: Supabase CLI

If you have the Supabase CLI installed:

```bash
# Create a new migration file
supabase migration new add_term_of_agreement_column

# Add the SQL to the generated migration file
# Then apply the migration
supabase db push
```

## Verification

After running the migration, verify it was successful:

```sql
-- Check if the column exists
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' 
  AND column_name = 'term_of_agreement';
```

Expected result:
- **column_name**: `term_of_agreement`
- **data_type**: `boolean`
- **is_nullable**: `YES`
- **column_default**: `NULL`

## Column Details

- **Name**: `term_of_agreement`
- **Type**: `BOOLEAN`
- **Nullable**: `YES`
- **Default**: `NULL`

### Values

- `NULL` - User has not been presented with terms (legacy users or new signups before acceptance)
- `false` - User was presented with terms but declined (not currently used)
- `true` - User has accepted the Terms of Service and Privacy Policy

## Impact

Once this column is added:

1. New users will be required to accept terms before proceeding to payment
2. The `/api/accept-terms` endpoint will update this column to `true`
3. The `/api/stripe/create-checkout-session` endpoint will validate this column
4. Existing users with `NULL` values can still use the system (grandfathered in)

## Rollback

If you need to remove this column:

```sql
-- Remove the term_of_agreement column
ALTER TABLE profiles 
DROP COLUMN IF EXISTS term_of_agreement;
```

**Warning**: This will delete all terms acceptance data. Only do this if you're certain you want to remove the feature.

## Troubleshooting

### Error: "column already exists"

If you see this error, the column has already been added. You can verify by running the verification query above.

### Error: "permission denied"

Make sure you're using a database user with sufficient privileges. The Supabase dashboard SQL Editor uses the `postgres` role which has full permissions.

### Column not showing in API responses

Make sure your Supabase RLS (Row Level Security) policies allow reading the `term_of_agreement` column. You may need to update your policies:

```sql
-- Example: Allow users to read their own term_of_agreement status
CREATE POLICY "Users can view own term_of_agreement"
ON profiles FOR SELECT
USING (auth.uid() = id);
```
