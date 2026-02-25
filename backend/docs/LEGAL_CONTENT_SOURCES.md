# Legal Content Sources for ActorRise

This document outlines all current and potential sources for legally obtaining theatrical content for ActorRise's monologue database.

## Legal Criteria

All content must meet these requirements:
1. **Public Domain** (published before 1928 in the US) OR
2. **Explicitly Licensed** for commercial use (CC0, CC-BY, etc.) OR
3. **API Access Permitted** by the content provider's terms of service

**Language Requirement**: English-language content only to ensure quality and usability for our target audience.

---

## Current Sources (Implemented)

### 1. Project Gutenberg
- **URL**: https://www.gutenberg.org
- **API**: Gutendex (https://gutendex.com)
- **Legal Status**: Public domain works (pre-1928 in US)
- **Language Filtering**: ✅ Implemented via API parameter `languages=en`
- **Content**: Classical plays by Shakespeare, Chekhov, Ibsen, Wilde, Shaw, Molière, Greek tragedies, etc.
- **Implementation**: `app/services/data_ingestion/gutenberg_scraper.py`
- **Rate Limits**: Respectful scraping (1-2 sec delays)
- **Terms**: Free and unrestricted access

### 2. Internet Archive (Archive.org)
- **URL**: https://archive.org
- **API**: Internet Archive Python library
- **Legal Status**: Public domain collection (pre-1928 filter applied)
- **Language Filtering**: ✅ Implemented via query filter `language:eng`
- **Content**: Public domain theater, American drama, historical plays
- **Implementation**: `app/services/data_ingestion/archive_org_scraper.py`
- **Rate Limits**: 2 second delays between requests
- **Terms**: Free access with attribution recommended

### 3. IMDb + OMDb (Film/TV References)
- **URL**: https://www.omdbapi.com
- **API**: OMDb API (requires API key)
- **Legal Status**: Metadata only (fair use), no full scripts
- **Language Filtering**: ✅ Implemented via OMDb Language field check
- **Content**: Film and TV metadata for scene reference matching
- **Implementation**: `scripts/seed_film_tv_references.py`
- **Rate Limits**: 100ms delays (1000 requests/day free tier)
- **Terms**: Patreon supporter or paid API key required

### 4. Perseus Digital Library
- **URL**: http://www.perseus.tufts.edu
- **API**: Perseus Catalog API / CTS API
- **Legal Status**: Public domain classical texts
- **Language Filtering**: ✅ English translations
- **Content**: Greek and Roman drama in English translation (Aeschylus, Sophocles, Euripides, Aristophanes, Plautus, Terence, Seneca)
- **Implementation**: `app/services/data_ingestion/perseus_scraper.py`
- **Rate Limits**: 1.5 second delays
- **Terms**: Free access, scholarly annotations included
- **Status**: ✅ **IMPLEMENTED** (2026-02-24)

### 5. Wikisource
- **URL**: https://en.wikisource.org
- **API**: MediaWiki API
- **Legal Status**: Public domain works with community verification
- **Language Filtering**: ✅ English Wikisource subdomain
- **Content**: Well-formatted plays with editorial notes, organized by Category:Plays
- **Implementation**: `app/services/data_ingestion/wikisource_scraper.py`
- **Rate Limits**: 1 second delays (respectful scraping)
- **Terms**: Free access, community-verified accuracy
- **Status**: ✅ **IMPLEMENTED** (2026-02-24)

---

## Potential New Sources (Legal & Feasible)

### 6. HathiTrust Digital Library
- **URL**: https://www.hathitrust.org
- **API**: ⚠️ **Data API RETIRED July 2024** - Use HTRC or Research Datasets instead
- **Legal Status**: Public domain works verified by HathiTrust
- **Language Filtering**: Metadata includes language field
- **Content**: Academic collection of plays, including rare and international works
- **Implementation**: `app/services/data_ingestion/hathitrust_scraper.py` (reference only - API retired)
- **Alternatives**:
  - HathiTrust Research Center (HTRC) - apply for membership
  - Research Datasets - bulk metadata downloads
  - Respectful catalog scraping (public domain only)
- **Status**: ⚠️ **ON HOLD** - Data API retired, need alternative approach
- **Recommendation**: Deprioritize until HTRC membership obtained or focus on other working sources

### 7. Early English Books Online (EEBO)
- **URL**: https://quod.lib.umich.edu/e/eebogroup/
- **API**: Text Creation Partnership (TCP) texts available
- **Legal Status**: Public domain (pre-1700 works)
- **Content**: Renaissance and early modern English drama (Marlowe, Jonson, etc.)
- **Language Filtering**: All English
- **Advantages**:
  - Rare early modern plays
  - Scholarly editions
  - Fills gap in Elizabethan/Jacobean drama
- **Implementation Considerations**:
  - No REST API, requires HTML parsing or TCP XML downloads
  - Smaller collection but unique content
- **Recommendation**: ⭐ **MEDIUM PRIORITY** - Specialized but valuable

### 8. Digital Library of India
- **URL**: https://ndl.iitkgp.ac.in
- **API**: Limited API access
- **Legal Status**: Public domain works (pre-1928)
- **Content**: Historical plays, including translations of Indian classics
- **Language Filtering**: Filter by language=English
- **Advantages**:
  - Unique cultural content
  - English translations of international works
- **Implementation Considerations**:
  - Limited API documentation
  - May require web scraping
  - Quality varies
- **Recommendation**: ⭐ **LOW PRIORITY** - Interesting but complex

### 9. Library of Congress Digital Collections
- **URL**: https://www.loc.gov/collections/
- **API**: LOC JSON API
- **Legal Status**: Public domain works clearly marked
- **Content**: American Theater Archive, historical plays
- **Language Filtering**: English collections
- **Advantages**:
  - High-quality scans
  - Well-documented metadata
  - Verified provenance
- **Implementation Considerations**:
  - API requires navigation of complex collection structure
  - Not all content is text (many images/PDFs)
  - OCR quality varies
- **Recommendation**: ⭐ **MEDIUM PRIORITY** - Quality over quantity

### 10. Open Library
- **URL**: https://openlibrary.org
- **API**: Open Library API
- **Legal Status**: Public domain works + lending
- **Content**: Plays in public domain
- **Language Filtering**: API supports language filtering
- **Advantages**:
  - Large collection
  - Modern API
  - Internet Archive integration
- **Implementation Considerations**:
  - Overlaps with Internet Archive
  - Full text only available for public domain works
  - Good for metadata enhancement
- **Recommendation**: ⭐ **LOW PRIORITY** - Overlaps with existing sources

---

## Sources to AVOID (Legal/Technical Concerns)

### ❌ Google Books
- **Issue**: Copyright restrictions, snippet-only access for most works
- **Status**: Not suitable for bulk scraping

### ❌ IMSDb (Internet Movie Script Database)
- **Issue**: Scripts are copyrighted, no clear licensing
- **Status**: Metadata OK (already used in film_tv_references), full scripts NOT allowed

### ❌ SimplyScripts
- **Issue**: Most scripts are copyrighted
- **Status**: Some public domain scripts available but unclear licensing

### ❌ Drew's Script-O-Rama
- **Issue**: Hosting copyrighted scripts without permission
- **Status**: Legally questionable, avoid

### ❌ Contemporary Play Publishers (Samuel French, Dramatists Play Service, etc.)
- **Issue**: All content under copyright
- **Status**: Cannot scrape, requires licensing deals (future partnership opportunity)

---

## Implementation Status

### ✅ Completed (2026-02-24)
1. **Project Gutenberg** - Classical plays, public domain works
2. **Internet Archive** - Public domain theater and drama
3. **IMDb + OMDb** - Film/TV metadata for reference matching
4. **Wikisource** - Clean text, community-verified plays
5. **Perseus Digital Library** - Classical Greek/Roman drama

### ⚠️ Partially Implemented
6. **HathiTrust** - Structure ready, awaiting API credentials

### 📋 Planned Implementation

#### Phase 2 (Next Quarter)
- **Library of Congress** - High-quality American theater archive
- **EEBO** - Early modern English drama (Marlowe, Jonson)

#### Phase 3 (Future Consideration)
- **Open Library** - Additional metadata enrichment
- **Digital Library of India** - Cultural diversity

---

## Implementation Guidelines

When adding a new source, ensure:

1. **Legal Compliance**
   - Verify terms of service allow scraping
   - Confirm public domain status (pre-1928 or explicit license)
   - Document legal justification in code comments

2. **Language Filtering**
   - Filter for English language in API query if possible
   - Validate language in metadata response
   - Log and skip non-English items

3. **Rate Limiting**
   - Minimum 1-2 second delays between requests
   - Respect API rate limits
   - Use exponential backoff for errors

4. **Content Quality**
   - Verify text is clean and readable
   - Check for OCR errors in samples
   - Ensure proper author/title attribution

5. **Deduplication**
   - Check existing plays before ingestion
   - Handle different editions of same work
   - Use `MonologueDeduplicator` service

6. **Metadata Enrichment**
   - Extract author, title, year, genre
   - Set `copyright_status='public_domain'`
   - Set `language='en'`
   - Include `source_url` for attribution

7. **Error Handling**
   - Log failures without stopping batch
   - Handle API errors gracefully
   - Report statistics (success/skip/fail)

---

## Next Steps

1. ✅ ~~Implement Wikisource scraper~~ (completed 2026-02-24)
2. ✅ ~~Implement Perseus Digital Library scraper~~ (completed 2026-02-24)
3. ⚠️ Apply for HathiTrust Research Center access and get API credentials
4. ✅ ~~Test language filtering across all sources~~ (completed 2026-02-24)
5. Implement Library of Congress scraper (Phase 2)
6. Implement EEBO scraper (Phase 2)
7. Monitor scraping stats in weekly workflow
8. Consider future licensing partnerships for contemporary works

---

**Last Updated**: 2026-02-24
**Maintained By**: ActorRise Backend Team
