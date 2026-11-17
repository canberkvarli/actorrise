import logging
import os
import threading
import time
from typing import Optional

import httpx
from app.core.config import settings
from jose import JWTError, jwt
from supabase import Client, create_client

logger = logging.getLogger(__name__)


def get_supabase_client() -> Optional[Client]:
    """Get Supabase client for auth verification."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# Until 2026-11-17 the token was decoded without checking its signature or
# expiry, so anyone who wrote {"sub": "<someone's id>"} into a token of their
# own was that person to the API. Supabase signs with an ES256 key it publishes
# at /auth/v1/.well-known/jwks.json; every token is now checked against it.
#
# AUTH_TOKEN_CHECK says what a failed check does:
#   "watch"   (default for now) the request goes through as before, and the
#             failure is logged and counted (user_events auth_token_unverified),
#             so anything legitimate sending a token we did not expect shows
#             up before it is shut out.
#   "enforce" the token is refused: 401.
_JWKS_TTL = 3600  # seconds a fetched key set is trusted
_JWKS_RETRY = 60  # an unknown kid asks again at most this often
_LEEWAY = 30  # seconds of clock skew allowed on exp
_jwks_lock = threading.Lock()
_jwks: dict = {"keys": {}, "at": 0.0}
_noted: dict[str, float] = {}


def _check_mode() -> str:
    return (os.getenv("AUTH_TOKEN_CHECK") or "watch").strip().lower()


def _fetch_jwks() -> dict:
    url = (settings.supabase_url or "").rstrip("/") + "/auth/v1/.well-known/jwks.json"
    r = httpx.get(url, timeout=5)
    r.raise_for_status()
    return {k["kid"]: k for k in r.json().get("keys", []) if k.get("kid")}


def _signing_key(kid: str | None) -> dict | None:
    now = time.time()
    with _jwks_lock:
        keys, at = _jwks["keys"], _jwks["at"]
        stale = now - at > _JWKS_TTL
        missing = kid not in keys and now - at > _JWKS_RETRY
        if stale or missing:
            try:
                _jwks["keys"], _jwks["at"] = _fetch_jwks(), now
            except Exception as e:
                # Keep the last good set; Supabase being slow must not log everyone out.
                logger.warning("Supabase JWKS fetch failed: %s", e)
                _jwks["at"] = now if not keys else at
        return _jwks["keys"].get(kid) if kid else None


def _verified_claims(token: str) -> dict:
    """The token's claims if Supabase signed it and it has not expired. Raises
    JWTError (with the reason) otherwise."""
    header = jwt.get_unverified_header(token)
    alg = header.get("alg")
    if alg not in ("ES256", "RS256"):
        raise JWTError(f"alg {alg}")
    key = _signing_key(header.get("kid"))
    if key is None:
        raise JWTError("unknown kid")
    return jwt.decode(
        token,
        key,
        algorithms=[alg],
        options={"verify_aud": False, "leeway": _LEEWAY},
    )


def _note_failure(reason: str, alg: str | None) -> None:
    """Log and count a failed check, at most once per reason every 5 minutes per
    process, so a flood of bad tokens is not a flood of writes."""
    key = f"{reason}|{alg}"
    now = time.time()
    if now - _noted.get(key, 0) < 300:
        return
    _noted[key] = now
    logger.warning("Supabase token failed verification (%s, alg=%s, mode=%s)", reason, alg, _check_mode())
    try:
        from app.services.events import record_user_event

        record_user_event(None, "auth_token_unverified", {"reason": reason[:80], "alg": alg or "", "mode": _check_mode()})
    except Exception:
        pass


def verify_supabase_token(token: str) -> Optional[dict]:
    """Verify a Supabase JWT and return {sub, email, user_metadata}, or None.

    Signature and expiry are checked against Supabase's published key. In
    "watch" mode a token that fails is still read (and the failure noted);
    in "enforce" mode it is refused. See AUTH_TOKEN_CHECK above."""
    try:
        try:
            payload = _verified_claims(token)
        except JWTError as e:
            try:
                alg = jwt.get_unverified_header(token).get("alg")
            except JWTError:
                alg = None
            _note_failure(str(e) or type(e).__name__, alg)
            if _check_mode() == "enforce":
                return None
            payload = jwt.decode(
                token,
                key="",
                options={"verify_signature": False, "verify_aud": False, "verify_exp": False},
            )

        user_id = payload.get("sub")
        if not user_id:
            logger.warning("Token missing 'sub' claim")
            return None
        return {
            "sub": user_id,
            "email": payload.get("email"),
            "user_metadata": payload.get("user_metadata", {}),
        }
    except JWTError as e:
        logger.warning("JWT decode error: %s", e)
        return None
    except Exception:
        logger.exception("Unexpected error verifying token")
        return None
