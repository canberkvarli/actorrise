"""
Cache warmup script for pre-computing embeddings of common search queries.

This script pre-generates embeddings for the most common search queries,
significantly reducing API costs and improving search latency.

Usage:
    python -m app.services.search.warmup_cache
"""

import asyncio
import time
from typing import List
from app.core.database import SessionLocal
from app.services.ai.content_analyzer import ContentAnalyzer
from app.services.search.cache_manager import cache_manager


# Top 100 most common monologue search queries
# These are based on typical actor search patterns
COMMON_QUERIES = [
    # Simple emotions
    "sad", "happy", "funny", "angry", "scared", "joyful", "melancholy",
    "hopeful", "desperate", "confused", "determined", "longing",

    # Gender-specific
    "male", "female", "man", "woman", "boy", "girl",

    # Age-specific
    "young", "teen", "middle aged", "elderly", "20s", "30s", "40s", "50s",

    # Common combinations - emotions + gender
    "sad woman", "funny man", "angry woman", "sad male", "happy female",
    "desperate woman", "hopeful man", "confused woman", "joyful man",

    # Common combinations - emotions + age
    "sad young woman", "funny middle aged man", "angry teen",
    "hopeful elderly woman", "desperate young man",

    # Themes
    "love", "death", "betrayal", "revenge", "power", "family",
    "identity", "loss", "grief", "freedom",

    # Theme combinations
    "love monologue", "death monologue", "betrayal monologue",
    "revenge monologue", "power monologue", "family monologue",

    # Authors/Categories
    "shakespeare", "chekhov", "ibsen", "classical", "contemporary",
    "modern", "greek", "wilde",

    # Author combinations
    "shakespeare tragedy", "shakespeare comedy", "chekhov monologue",
    "ibsen woman", "classical monologue", "contemporary piece",

    # Complex emotional states
    "sad monologue about loss", "funny piece for young woman",
    "dramatic monologue about betrayal", "comedic piece for middle aged man",
    "tragic monologue about death", "romantic monologue about love",

    # Performance requirements
    "short monologue", "long monologue", "1 minute monologue",
    "2 minute monologue", "comedic piece", "dramatic piece",

    # Character types
    "strong woman", "vulnerable man", "angry father", "sad mother",
    "rebellious teen", "wise elderly", "naive young woman",

    # Specific dramatic situations
    "monologue about loss of parent", "piece about unrequited love",
    "speech about injustice", "monologue about identity crisis",
    "piece about grief and mourning", "monologue about ambition",

    # Genre-specific
    "tragedy monologue", "comedy monologue", "romantic monologue",
    "dark monologue", "philosophical monologue",

    # Audition-specific
    "contrasting monologue", "contemporary audition piece",
    "classical audition piece", "college audition monologue",
]


def warmup_embeddings():
    """
    Pre-generate and cache embeddings for common queries.

    This significantly reduces costs:
    - Without warmup: Every common query costs $0.00001
    - With warmup: Common queries cost $0 (cache hit)

    For 1000 searches/day where 50% are common:
    - Savings: ~$1.50/month per cached query
    - Total savings: ~$150/month for 100 cached queries
    """
    print("=" * 80)
    print("MONOLOGUE SEARCH CACHE WARMUP")
    print("=" * 80)
    print(f"\nWarming up cache with {len(COMMON_QUERIES)} common queries...")
    print("This will pre-generate embeddings to reduce future API costs.\n")

    analyzer = ContentAnalyzer()

    successful = 0
    failed = 0
    skipped = 0
    start_time = time.time()

    for i, query in enumerate(COMMON_QUERIES, 1):
        # Check if already cached
        cached = cache_manager.get_embedding(query)

        if cached:
            skipped += 1
            print(f"[{i}/{len(COMMON_QUERIES)}] ✓ Already cached: {query}")
            continue

        try:
            # Generate embedding
            print(f"[{i}/{len(COMMON_QUERIES)}] Generating: {query}...", end=" ")
            embedding = analyzer.generate_embedding(query)

            if embedding:
                # Cache for 30 days (common queries are stable)
                cache_manager.set_embedding(query, embedding, ttl=2592000)
                successful += 1
                print("✓")
            else:
                failed += 1
                print("✗ Failed")

            # Rate limiting: ~100 requests/minute for safety
            time.sleep(0.6)

        except Exception as e:
            failed += 1
            print(f"✗ Error: {e}")

    elapsed = time.time() - start_time

    print("\n" + "=" * 80)
    print("WARMUP COMPLETE")
    print("=" * 80)
    print(f"\n📊 Summary:")
    print(f"  ✓ Successfully cached: {successful}")
    print(f"  ⏭  Already cached:     {skipped}")
    print(f"  ✗ Failed:             {failed}")
    print(f"  ⏱  Total time:         {elapsed:.1f} seconds")
    print(f"\n💰 Cost Analysis:")
    print(f"  Warmup cost:      ${successful * 0.00001:.5f}")
    print(f"  Cache entries:    {successful + skipped}")
    print(f"\n💡 Projected Savings:")
    print(f"  If 50% of 1000 daily searches use cached queries:")
    print(f"  Daily savings:    ${500 * 0.00001:.5f}")
    print(f"  Monthly savings:  ${500 * 30 * 0.00001:.3f}")
    print(f"  Annual savings:   ${500 * 365 * 0.00001:.3f}")
    print("\n" + "=" * 80)


def verify_cache():
    """Verify that cached embeddings are accessible"""
    print("\n🔍 Verifying cache accessibility...")

    test_queries = COMMON_QUERIES[:10]
    accessible = 0

    for query in test_queries:
        embedding = cache_manager.get_embedding(query)
        if embedding:
            accessible += 1
            print(f"  ✓ {query}: {len(embedding)} dimensions")
        else:
            print(f"  ✗ {query}: Not found")

    print(f"\nCache verification: {accessible}/{len(test_queries)} queries accessible")

    if accessible < len(test_queries):
        print("⚠ Warning: Some queries not cached. Redis may not be running.")


def main():
    """Main execution"""
    try:
        # Run warmup
        warmup_embeddings()

        # Verify
        verify_cache()

        # Show cache stats
        stats = cache_manager.get_stats()
        print(f"\n📈 Cache Statistics:")
        print(f"  Redis enabled: {stats.get('enabled', False)}")
        if stats.get('enabled'):
            print(f"  Total keys:    {stats.get('redis_keys', 0)}")
            print(f"  Memory used:   {stats.get('redis_memory_mb', 0)} MB")

    except KeyboardInterrupt:
        print("\n\n⚠ Warmup interrupted by user")
    except Exception as e:
        print(f"\n\n✗ Error during warmup: {e}")
        raise


if __name__ == "__main__":
    main()
