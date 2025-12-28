# Supabase Setup Guide

## Why Supabase is Perfect for ActorRise

✅ **PostgreSQL Database** - Stores all your profile data, users, and monologues  
✅ **pgvector Built-in** - Native vector search for AI-powered monologue matching  
✅ **File Storage** - Perfect for storing headshot images  
✅ **Free Tier** - 500MB database, 1GB file storage, perfect for getting started  
✅ **Easy Setup** - 5 minutes to get running  
✅ **Production Ready** - Scales as you grow  

## Current Setup

Right now, your profile data is saved to:
- **Database**: `backend/database.db` (SQLite file on your computer)
- **Headshots**: Stored as base64 strings in the database (not ideal - takes up space)

With Supabase, you'll get:
- **Database**: Cloud PostgreSQL (accessible from anywhere)
- **Headshots**: Proper file storage (faster, cheaper, better)

## Quick Setup (5 minutes)

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up (free) or log in
3. Click "New Project"
4. Fill in:
   - **Name**: `actorrise` (or whatever you want)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to you
5. Click "Create new project"
6. Wait 2 minutes for setup

### Step 2: Get Your Connection String

1. In your Supabase project, go to **Settings** → **Database**
2. Scroll to "Connection string"
3. Under "URI", copy the connection string
4. It looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`
5. Replace `[YOUR-PASSWORD]` with the password you created

### Step 3: Enable pgvector Extension

1. In Supabase, go to **SQL Editor**
2. Click "New query"
3. Run this SQL:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. Click "Run" (or press Cmd/Ctrl + Enter)

### Step 4: Update Your Backend

1. Create/update `backend/.env`:
   ```env
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres
   JWT_SECRET=your-secret-key-change-in-production
   JWT_ALGORITHM=HS256
   CORS_ORIGINS=http://localhost:3000
   OPENAI_API_KEY=your-openai-key-if-you-have-one
   ```

2. Install dependencies (if not already):
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. Run migration (if you have existing data):
   ```bash
   python migrate_to_postgres.py
   ```

   Or just start fresh - the app will create tables automatically!

4. Start your backend:
   ```bash
   uvicorn app.main:app --reload
   ```

### Step 5: Set Up File Storage (for Headshots)

1. In Supabase, go to **Storage**
2. Click "Create a new bucket"
3. Name: `headshots`
4. **Public bucket**: ✅ Check this (so images can be accessed)
5. Click "Create bucket"

6. Set up storage policies (for security):
   - Go to **Storage** → **Policies**
   - Click on `headshots` bucket
   - Add policy:
     - **Policy name**: "Users can upload their own headshots"
     - **Allowed operation**: INSERT
     - **Policy definition**:
       ```sql
       (bucket_id = 'headshots'::text) AND (auth.uid()::text = (storage.foldername(name))[1])
       ```
     - Click "Save policy"
   - Add another policy for reading:
     - **Policy name**: "Anyone can view headshots"
     - **Allowed operation**: SELECT
     - **Policy definition**:
       ```sql
       bucket_id = 'headshots'::text
       ```
     - Click "Save policy"

### Step 6: Update Backend for File Uploads (Optional but Recommended)

You'll want to add an endpoint to upload headshots to Supabase Storage. I can help you with this!

## What Gets Saved Where

### Profile Data (Saved to PostgreSQL)
- Name, age, gender, location
- Experience level, training background
- Preferred genres, search preferences
- All stored in `actor_profiles` table

### Headshots (Saved to Supabase Storage)
- Image files stored in `headshots` bucket
- URL saved in database: `https://xxxxx.supabase.co/storage/v1/object/public/headshots/user-123/headshot.jpg`

### Monologues (Saved to PostgreSQL)
- All monologue data
- Embeddings for AI search (using pgvector)

## Testing It Works

1. Start your backend: `cd backend && uvicorn app.main:app --reload`
2. Start your frontend: `cd frontend && npm run dev`
3. Sign up / log in
4. Go to profile page
5. Fill out your profile and save
6. Check Supabase dashboard → **Table Editor** → `actor_profiles` - you should see your data!

## Free Tier Limits

- **Database**: 500MB (plenty for thousands of profiles)
- **File Storage**: 1GB (thousands of headshots)
- **API Requests**: Unlimited
- **Bandwidth**: 5GB/month

## When You Need More

Supabase scales easily:
- **Pro Plan**: $25/month - 8GB database, 100GB storage
- **Team Plan**: $599/month - For larger teams

## Troubleshooting

### "Connection refused"
- Check your DATABASE_URL is correct
- Make sure you replaced `[YOUR-PASSWORD]` with actual password

### "Extension vector does not exist"
- Run `CREATE EXTENSION vector;` in SQL Editor

### "Table doesn't exist"
- The app creates tables automatically on startup
- Check `backend/app/main.py` - `init_db()` runs on startup

### Headshots not uploading
- Make sure bucket is public
- Check storage policies are set correctly
- We may need to add file upload endpoint (I can help!)

## Next Steps

1. ✅ Set up Supabase (follow steps above)
2. 🔄 Add file upload endpoint for headshots (I can help!)
3. 🚀 Deploy your app!

Want me to help you add the headshot upload functionality to use Supabase Storage?

