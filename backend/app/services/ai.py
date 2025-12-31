from typing import List, Dict, Optional
import numpy as np
from openai import OpenAI
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.actor import ActorProfile, Monologue


# Initialize OpenAI client
client = None
if settings.openai_api_key and settings.openai_api_key != "optional-for-mvp":
    try:
        client = OpenAI(api_key=settings.openai_api_key)
    except Exception as e:
        print(f"Warning: Failed to initialize OpenAI client: {e}")
        client = None


def get_embedding(text: str) -> Optional[List[float]]:
    """
    Generate embedding for a text using OpenAI API.
    Returns None if API key is not configured or API call fails.
    """
    if not client or not text:
        return None
    
    try:
        response = client.embeddings.create(
            model=settings.openai_embedding_model,
            input=text.strip()
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Error generating embedding: {e}")
        return None


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    
    vec1_array = np.array(vec1)
    vec2_array = np.array(vec2)
    
    dot_product = np.dot(vec1_array, vec2_array)
    norm1 = np.linalg.norm(vec1_array)
    norm2 = np.linalg.norm(vec2_array)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return float(dot_product / (norm1 * norm2))


def vector_search_monologues(
    db: Session,
    query_embedding: List[float],
    limit: int = 20,
    filters: Optional[Dict] = None
) -> List[tuple]:
    """
    Perform efficient vector similarity search using PostgreSQL pgvector.
    Returns list of (monologue, similarity_score) tuples.
    """
    if query_embedding:
        try:
            # Build query string with filters
            conditions = ["embedding IS NOT NULL"]
            params = {}
            
            # Convert embedding to PostgreSQL array format
            embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
            
            if filters:
                if filters.get("age_range"):
                    conditions.append("age_range = :age_range")
                    params["age_range"] = filters["age_range"]
                if filters.get("gender"):
                    conditions.append("gender = :gender")
                    params["gender"] = filters["gender"]
                if filters.get("genre"):
                    conditions.append("genre = :genre")
                    params["genre"] = filters["genre"]
                if filters.get("difficulty"):
                    conditions.append("difficulty = :difficulty")
                    params["difficulty"] = filters["difficulty"]
            
            where_clause = " AND ".join(conditions)
            
            # Build the query
            query_str = f"""
                SELECT 
                    id, title, author, age_range, gender, genre, difficulty,
                    excerpt, full_text_url, source_url, created_at,
                    1 - (embedding <=> :query_vec::vector) as similarity
                FROM monologues
                WHERE {where_clause}
                ORDER BY similarity DESC
                LIMIT :limit
            """
            
            params["query_vec"] = embedding_str
            params["limit"] = limit
            
            result = db.execute(text(query_str), params)
            rows = result.fetchall()
            
            # Convert to Monologue objects with similarity scores
            from app.models.actor import Monologue
            results = []
            for row in rows:
                monologue = Monologue(
                    id=row[0],
                    title=row[1],
                    author=row[2],
                    age_range=row[3],
                    gender=row[4],
                    genre=row[5],
                    difficulty=row[6],
                    excerpt=row[7],
                    full_text_url=row[8],
                    source_url=row[9],
                    created_at=row[10]
                )
                similarity = float(row[11]) if row[11] else 0.0
                results.append((monologue, similarity))
            
            return results
        except Exception as e:
            print(f"Error in vector search: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    return []


def parse_embedding(embedding_data):
    """
    Parse embedding from database.
    PostgreSQL with pgvector returns list directly.
    """
    if not embedding_data:
        return None
    
    # PostgreSQL with pgvector returns list directly
    if isinstance(embedding_data, list):
        return embedding_data
    # Sometimes it might be returned as a numpy array or other format
    try:
        return list(embedding_data)
    except:
        return None


def format_embedding(embedding: Optional[List[float]]):
    """
    Format embedding for database storage.
    PostgreSQL with pgvector expects a list/array.
    """
    if not embedding:
        return None
    # PostgreSQL with pgvector expects a list/array
    return embedding


def generate_monologue_embedding(monologue: Monologue) -> Optional[List[float]]:
    """
    Generate embedding for a monologue based on its content.
    Combines title, author, excerpt, and metadata for better semantic search.
    """
    # Create a comprehensive text representation
    text_parts = []
    
    if monologue.title:
        text_parts.append(f"Title: {monologue.title}")
    if monologue.author:
        text_parts.append(f"Author: {monologue.author}")
    if monologue.excerpt:
        text_parts.append(f"Excerpt: {monologue.excerpt}")
    if monologue.genre:
        text_parts.append(f"Genre: {monologue.genre}")
    if monologue.age_range:
        text_parts.append(f"Age range: {monologue.age_range}")
    if monologue.gender:
        text_parts.append(f"Gender: {monologue.gender}")
    if monologue.difficulty:
        text_parts.append(f"Difficulty: {monologue.difficulty}")
    
    combined_text = " ".join(text_parts)
    return get_embedding(combined_text)


def calculate_relevance_score(
    monologue: Monologue, profile: ActorProfile, query: str = ""
) -> float:
    """
    Calculate relevance score based on profile matching (fallback when embeddings not available).
    Returns a score between 0 and 1.
    """
    score = 0.0
    factors = 0

    # Age range match (30% weight)
    if monologue.age_range and profile.age_range:
        if monologue.age_range == profile.age_range:
            score += 0.3
        factors += 0.3

    # Gender match (20% weight)
    if monologue.gender and profile.gender:
        if monologue.gender.lower() == profile.gender.lower():
            score += 0.2
        factors += 0.2

    # Genre preference match (25% weight)
    if monologue.genre and profile.preferred_genres:
        if monologue.genre in profile.preferred_genres:
            score += 0.25
        factors += 0.25

    # Experience level match (15% weight)
    if profile.experience_level:
        if profile.experience_level == "Professional" and monologue.difficulty in ["Advanced", "Professional"]:
            score += 0.15
        elif profile.experience_level == "Emerging" and monologue.difficulty in ["Intermediate", "Advanced"]:
            score += 0.15
        elif profile.experience_level == "Student" and monologue.difficulty in ["Beginner", "Intermediate"]:
            score += 0.15
        factors += 0.15

    # Query keyword match (10% weight)
    if query:
        query_lower = query.lower()
        title_match = query_lower in monologue.title.lower() if monologue.title else False
        author_match = query_lower in monologue.author.lower() if monologue.author else False
        excerpt_match = query_lower in monologue.excerpt.lower() if monologue.excerpt else False
        
        if title_match or author_match or excerpt_match:
            score += 0.1
        factors += 0.1

    # Normalize score
    if factors > 0:
        score = score / factors

    return min(score, 1.0)


def recommend_monologues(
    monologues: List[Monologue],
    profile: ActorProfile,
    query: str = "",
    limit: int = 20,
    use_semantic_search: bool = True,
    db: Optional[Session] = None,
    filters: Optional[Dict] = None
) -> List[Dict]:
    """
    Recommend monologues using semantic search with embeddings or fallback to rule-based scoring.
    Uses native PostgreSQL vector search for better performance.
    """
    scored_monologues = []
    
    # Use efficient PostgreSQL vector search if query provided
    if use_semantic_search and query and client and db:
        query_embedding = get_embedding(query)
        
        if query_embedding:
            # Use native PostgreSQL vector search
            vector_results = vector_search_monologues(db, query_embedding, limit=limit * 2, filters=filters)
            
            if vector_results:
                # Combine semantic scores with profile-based scores
                for monologue, semantic_score in vector_results:
                    profile_score = calculate_relevance_score(monologue, profile, query)
                    # Weight: 70% semantic, 30% profile matching
                    relevance_score = (semantic_score * 0.7) + (profile_score * 0.3)
                    
                    scored_monologues.append({
                        "monologue": monologue,
                        "relevance_score": relevance_score
                    })
                
                # Sort and limit
                scored_monologues.sort(key=lambda x: x["relevance_score"], reverse=True)
                return scored_monologues[:limit]
    
    # Fallback: Python-based search (when vector search unavailable)
    if use_semantic_search and query and client:
        query_embedding = get_embedding(query)
        
        if query_embedding:
            for monologue in monologues:
                # Get monologue embedding from database
                monologue_embedding = None
                if hasattr(monologue, 'embedding') and monologue.embedding:
                    monologue_embedding = parse_embedding(monologue.embedding)
                
                if monologue_embedding:
                    # Calculate semantic similarity
                    semantic_score = cosine_similarity(query_embedding, monologue_embedding)
                    
                    # Combine with profile-based score (weighted)
                    profile_score = calculate_relevance_score(monologue, profile, query)
                    
                    # Weight: 70% semantic, 30% profile matching
                    relevance_score = (semantic_score * 0.7) + (profile_score * 0.3)
                else:
                    # Fallback to profile-based scoring
                    relevance_score = calculate_relevance_score(monologue, profile, query)
                
                scored_monologues.append({
                    "monologue": monologue,
                    "relevance_score": relevance_score
                })
        else:
            # Fallback to profile-based scoring
            for monologue in monologues:
                relevance_score = calculate_relevance_score(monologue, profile, query)
                scored_monologues.append({
                    "monologue": monologue,
                    "relevance_score": relevance_score
                })
    else:
        # Use profile-based scoring only
        for monologue in monologues:
            relevance_score = calculate_relevance_score(monologue, profile, query)
            scored_monologues.append({
                "monologue": monologue,
                "relevance_score": relevance_score
            })
    
    # Sort by relevance score (descending)
    scored_monologues.sort(key=lambda x: x["relevance_score"], reverse=True)
    
    # Return top results
    return scored_monologues[:limit]
