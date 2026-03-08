# Supabase Setup Guide (BrainGain)

This guide walks you through setting up Supabase for the BrainGain project.

## Step 1: Create a Supabase project

1. Go to `https://supabase.com`
2. Sign in or create an account (free)
3. Click **New Project**
4. Fill in:
   - **Name**: `braingain` (or any name)
   - **Database Password**: generate a strong password and **save it** (you’ll need it later)
   - **Region**: choose the closest region (e.g. `West Europe`)
5. Click **Create new project**
6. Wait ~2–3 minutes for provisioning

## Step 2: Run the SQL migration

### New projects

1. In Supabase Dashboard open **SQL Editor**
2. Click **New query**
3. Copy the entire contents of `supabase/migration.sql`
4. Paste into the SQL Editor
5. Click **Run** (or press `Ctrl+Enter`)
6. You should see: `Success. No rows returned`

### Existing projects (adding `reward_minutes`)

If you already have an existing database and need to add `reward_minutes`:

1. Open **SQL Editor**
2. Click **New query**
3. Copy `supabase/add_reward_minutes.sql`
4. Paste and **Run**
5. The verification query at the bottom should show the new column

## Step 3: Create a Storage bucket

1. Open **Storage** in Supabase Dashboard
2. Click **Create a new bucket**
3. Fill in:
   - **Name**: `documents`
   - **Public bucket**: ✅ **YES** (so PDFs can be viewed/downloaded)
4. Click **Create bucket**

### Storage policies (REQUIRED)

To allow public read and write access (this project does not use Supabase Auth), create two policies on `storage.objects`.

1. In **Storage**, open the `documents` bucket
2. Go to the **Policies** tab
3. Click **New Policy** (twice: once for SELECT, once for INSERT)

#### Policy 1: Public read access (SELECT)

Choose **For full customization** and paste:

```sql
-- Policy: Public read access
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents');
```

#### Policy 2: Public write access (INSERT)

Choose **For full customization** and paste:

```sql
-- Policy: Public write access
CREATE POLICY "Public Write Access"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents');
```

Without these policies, PDF upload/viewing will not work.

## Step 4: Get project API keys

1. Open **Settings** (gear icon)
2. Select **API**
3. Find **Project API keys**
4. Copy:
   - **`anon` `public`** key (used by the Next.js app)
   - **`service_role` `secret`** key (do not expose publicly; only for server-side use if ever needed)
5. Also copy **Project URL** (e.g. `https://xxxxx.supabase.co`)

## Step 5: Configure environment variables

1. In the project root, create `.env.local`
2. Add:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# OpenAI
OPENAI_API_KEY=your_openai_key_here

# Admin auth (for the admin panel)
ADMIN_SECRET=a_very_long_random_secret_string

# Groq (optional, for ASR fallback)
GROQ_API_KEY=your_groq_api_key_here
```

3. `.env.local` should be ignored by git (do not commit it).

## Step 6: Verify setup

Run the following in Supabase **SQL Editor**:

```sql
-- Verify tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('materials', 'attempts', 'rewards', 'quizzes');

-- Verify bucket
SELECT name, public
FROM storage.buckets
WHERE name = 'documents';
```

Both queries should return results.

## Troubleshooting

### Problem: `relation already exists`

- Tables already exist. You can drop them manually or add `DROP TABLE IF EXISTS` before `CREATE TABLE`.

### Problem: `permission denied for schema storage`

- Make sure you are logged in as the project owner and editing policies on the correct schema.

### Problem: Bucket is not public

- Verify bucket settings and policies under **Storage → Policies**.

### Problem: `new row violates row-level security policy` when uploading a PDF

- You must add the Storage INSERT policy. Ensure you have **both** policies:
  1. `Public Read Access` (SELECT)
  2. `Public Write Access` (INSERT)

### Problem: Tables don’t show up in Table Editor

- Refresh the page or confirm the migration succeeded in SQL Editor.

## Next steps

After setup you can:

1. Run the app and add materials in the admin panel
2. Verify PDF upload + viewing works
3. Verify quiz generation and reward minutes work end-to-end

