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

---

## Potential New Sources (Legal & Feasible)

### 4. HathiTrust Digital Library
- **URL**: https://www.hathitrust.org
- **API**: HathiTrust Data API
- **Legal Status**: Public domain works verified by HathiTrust
- **Content**: Academic collection of plays, including rare and international works
- **Language Filtering**: Metadata includes language field
- **Advantages**:
  - Verified public domain status
  - High-quality OCR
  - Academic rigor in cataloging
- **Implementation Considerations**:
  - API requires registration (free for non-commercial)
  - Bulk download requires Research Center agreement
  - Rate limits apply
- **Recommendation**: ⭐ **HIGH PRIORITY** - Large collection with verified public domain status

### 5. Wikisource
- **URL**: https://en.wikisource.org
- **API**: MediaWiki API
- **Legal Status**: Public domain works with community verification
- **Content**: Well-formatted plays with editorial notes
- **Language Filtering**: English Wikisource subdomain
- **Advantages**:
  - Clean, structured text
  - Already formatted for web display
  - Community-verified accuracy
  - Category browsing (Drama, Plays by author, etc.)
- **Implementation Considerations**:
  - Standard MediaWiki API
  - Rate limits: respectful scraping
  - Category: "Category:Plays" has thousands of works
- **Recommendation**: ⭐ **HIGH PRIORITY** - Clean text, easy to parse

### 6. Early English Books Online (EEBO)
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

### 7. Digital Library of India
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

### 8. Library of Congress Digital Collections
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

### 9. Perseus Digital Library
- **URL**: http://www.perseus.tufts.edu
- **API**: Perseus Catalog API
- **Legal Status**: Public domain classical texts
- **Content**: Greek and Roman drama in English translation
- **Language Filtering**: English translations available
- **Advantages**:
  - Authoritative classical texts
  - Multiple translations available
  - Scholarly annotations
- **Implementation Considerations**:
  - XML-based API
  - Focus on classical (Greek/Roman) works only
  - Well-structured but limited scope
- **Recommendation**: ⭐ **MEDIUM PRIORITY** - Excellent for classical drama

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

## Implementation Priority

### Phase 1 (High Priority - Immediate Implementation)
1. **Wikisource** - Clean text, easy API, large collection
2. **HathiTrust** - Verified public domain, academic quality

### Phase 2 (Medium Priority - Next Quarter)
3. **Perseus Digital Library** - Fill classical drama gap
4. **Library of Congress** - High-quality American theater
5. **EEBO** - Early modern drama specialization

### Phase 3 (Low Priority - Future Consideration)
6. **Open Library** - Additional metadata enrichment
7. **Digital Library of India** - Cultural diversity

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

1. Implement Wikisource scraper (estimated: 1-2 days)
2. Add HathiTrust integration (estimated: 2-3 days)
3. Test language filtering across all sources
4. Monitor scraping stats in weekly workflow
5. Consider future licensing partnerships for contemporary works

---

**Last Updated**: 2026-02-23
**Maintained By**: ActorRise Backend Team
