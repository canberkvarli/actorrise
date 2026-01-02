# Diagnosis: Why Only Shakespeare Monologues Appear in Search

## Problem
User reports that search results only show Shakespeare monologues, even though the database should contain 6,000 monologues from 12 different classical playwrights.

## What I've Added to Help Diagnose

### 1. Debug Endpoint (No Auth Required)
**URL:** `http://localhost:8000/api/monologues/debug/author-distribution`

This endpoint shows:
- Total monologues in database
- How many have embeddings
- Breakdown by author (count + embedding percentage)

**How to use:**
- Open in your browser while backend is running
- Or: `curl http://localhost:8000/api/monologues/debug/author-distribution`

### 2. Search Debug Logging
Added detailed console output to `/backend/app/services/search/semantic_search.py`

Every search now prints:
```
=== SEARCH RESULTS DEBUG ===
Query: <your search query>
Total filtered monologues: <count>
Results with scores: <count>

Top 5 results:
  1. Character from 'Play' by Author (score: 0.XXX)
  ...

Author distribution in filtered results:
  • William Shakespeare: 100
  • Anton Chekhov: 50
  ...
=== END DEBUG ===
```

**How to see this:**
- Check your backend console/logs while performing a search
- This will show exactly what's happening at each step

## Expected Authors in Database

According to `/backend/app/services/data_ingestion/gutenberg_scraper.py`, the database should have plays from:

1. **William Shakespeare** (29 plays listed)
2. **Anton Chekhov** (11 plays)
3. **Henrik Ibsen** (13 plays)
4. **Oscar Wilde** (7 plays)
5. **George Bernard Shaw** (15 plays)
6. **Molière** (9 plays)
7. **Sophocles** (7 plays)
8. **Euripides** (15 plays)
9. **Aeschylus** (5 plays)
10. **August Strindberg** (9 plays)
11. **Christopher Marlowe** (6 plays)
12. **Ben Jonson** (7 plays)

## Possible Causes

### 1. Only Shakespeare Data Was Ingested
- Only Shakespeare's plays were actually scraped/ingested
- **How to check:** Visit the debug endpoint above
- **Fix:** Run ingestion script for other authors

### 2. Only Shakespeare Has Embeddings
- All authors' monologues exist but only Shakespeare has vector embeddings
- **How to check:** Debug endpoint shows "with_embedding" count per author
- **Fix:** Generate embeddings for missing monologues

### 3. Search Filters Are Too Restrictive
- Filters are inadvertently filtering out non-Shakespeare content
- **How to check:** Look at "Author distribution in filtered results" in console
- **Fix:** Adjust filter logic in semantic_search.py

### 4. Embeddings Don't Match Non-Shakespeare Content
- All data and embeddings exist, but similarity scores favor Shakespeare
- **How to check:** Compare similarity scores in debug output
- **Fix:** May need to adjust boosting or search algorithm

## Next Steps

1. **Check Database Contents**
   - Visit: `http://localhost:8000/api/monologues/debug/author-distribution`
   - Save the JSON output and share it

2. **Test a Search**
   - Perform a search (e.g., "sad monologue")
   - Check backend console for debug output
   - Note the "Author distribution in filtered results"

3. **Based on Results**
   - If only Shakespeare in DB → Need to run ingestion for other authors
   - If others exist but no embeddings → Need to generate embeddings
   - If others have embeddings → Need to investigate filter/scoring logic

## Files Modified

- `backend/app/api/monologues.py` - Added `/debug/author-distribution` endpoint
- `backend/app/services/search/semantic_search.py` - Added debug logging
- `backend/check_authors.py` - Standalone script (requires proper env setup)

## Quick Test Commands

```bash
# Check author distribution (in browser or terminal)
curl http://localhost:8000/api/monologues/debug/author-distribution | jq

# Watch backend logs while searching
# (Backend console will show debug output for each search)
```

---

**Note:** The backend should auto-reload with these changes. If you don't see the new endpoint or debug output, restart the backend server.
