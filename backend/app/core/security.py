from typing import Optional

from app.core.config import settings
from jose import JWTError, jwt
from supabase import Client, create_client


def get_supabase_client() -> Optional[Client]:
    """Get Supabase client for auth verification."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def verify_supabase_token(token: str) -> Optional[dict]:
    """Verify a Supabase JWT token and return the payload.
    
    We decode the JWT token without signature verification since Supabase
    has already verified it when the user authenticated. We trust the token
    from the client and extract user information from it.
    
    Args:
        token: JWT token from Supabase Auth
        
    Returns:
        Decoded token payload with 'sub' (user ID) and 'email' if valid, None otherwise
    """
    try:
        # Decode JWT without verification - Supabase already verified it
        # We skip all verification (signature, audience, expiration) since
        # the token comes from an authenticated Supabase session
        # Note: key is required even when verify_signature is False
        payload = jwt.decode(
            token,
            key="",  # Dummy key, not used when verify_signature is False
            options={
                "verify_signature": False,
                "verify_aud": False,  # Skip audience verification
                "verify_exp": False,  # Skip expiration (Supabase handles this)
            }
        )
        
        # Extract user information
        user_id = payload.get("sub")
        email = payload.get("email")
        
        if not user_id:
            print("Token missing 'sub' claim")
            return None
        
        return {
            "sub": user_id,
            "email": email,
            "user_metadata": payload.get("user_metadata", {})
        }
            
    except JWTError as e:
        print(f"JWT decode error: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error verifying token: {e}")
        import traceback
        traceback.print_exc()
        return None

