"""The API checks a Supabase token's signature and expiry.

Until 2026-11-17 the token was decoded unverified, so a hand-written
{"sub": "<anyone's id>"} was that person to the API.
"""

import json
import time
import unittest
from unittest import mock

from cryptography.hazmat.primitives.asymmetric import ec
from jose import jwk, jwt

from app.core import security


def _ec_key(kid):
    private = ec.generate_private_key(ec.SECP256R1())
    from cryptography.hazmat.primitives import serialization

    pem = private.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    public = jwk.construct(pem, "ES256").public_key().to_dict()
    public.update({"kid": kid, "alg": "ES256", "use": "sig"})
    return pem, json.loads(json.dumps(public))


class TokenSignatureTest(unittest.TestCase):
    def setUp(self):
        self.pem, self.public = _ec_key("kid-1")
        self.other_pem, _ = _ec_key("kid-1")
        security._jwks.update({"keys": {}, "at": 0.0})
        security._noted.clear()
        self.noted = []
        self.patches = [
            mock.patch.object(security, "_fetch_jwks", lambda: {"kid-1": self.public}),
            mock.patch("app.services.events.record_user_event", lambda uid, name, props=None: self.noted.append(props)),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def _token(self, pem=None, kid="kid-1", alg="ES256", exp_in=3600, sub="user-1"):
        claims = {"sub": sub, "email": "a@b.com", "exp": int(time.time()) + exp_in, "aud": "authenticated"}
        return jwt.encode(claims, pem or self.pem, algorithm=alg, headers={"kid": kid})

    def _verify(self, token, mode):
        with mock.patch.dict("os.environ", {"AUTH_TOKEN_CHECK": mode}):
            return security.verify_supabase_token(token)

    def test_a_token_supabase_signed_passes(self):
        out = self._verify(self._token(), "enforce")
        self.assertEqual((out["sub"], out["email"]), ("user-1", "a@b.com"))
        self.assertEqual(self.noted, [])

    def test_a_token_signed_by_anyone_else_is_refused(self):
        self.assertIsNone(self._verify(self._token(pem=self.other_pem), "enforce"))

    def test_a_hand_written_hs256_token_is_refused(self):
        forged = self._token(pem="any-secret", alg="HS256")
        self.assertIsNone(self._verify(forged, "enforce"))

    def test_an_unsigned_token_is_refused(self):
        head, body, _ = self._token().split(".")
        self.assertIsNone(self._verify(f"{head}.{body}.", "enforce"))

    def test_an_expired_token_is_refused(self):
        self.assertIsNone(self._verify(self._token(exp_in=-600), "enforce"))

    def test_a_token_a_few_seconds_past_expiry_is_allowed(self):
        self.assertIsNotNone(self._verify(self._token(exp_in=-5), "enforce"))

    def test_an_unknown_key_is_refused(self):
        self.assertIsNone(self._verify(self._token(kid="kid-2"), "enforce"))

    def test_watch_mode_lets_it_through_and_notes_why(self):
        out = self._verify(self._token(pem=self.other_pem), "watch")
        self.assertEqual(out["sub"], "user-1")
        self.assertEqual(len(self.noted), 1)
        self.assertEqual(self.noted[0]["alg"], "ES256")

    def test_a_flood_of_bad_tokens_is_noted_once(self):
        for _ in range(20):
            self._verify(self._token(pem=self.other_pem), "watch")
        self.assertEqual(len(self.noted), 1)

    def test_watch_is_the_default(self):
        with mock.patch.dict("os.environ", {}, clear=False):
            import os

            os.environ.pop("AUTH_TOKEN_CHECK", None)
            self.assertIsNotNone(security.verify_supabase_token(self._token(pem=self.other_pem)))

    def test_supabase_unreachable_keeps_the_last_keys(self):
        self._verify(self._token(), "enforce")  # caches kid-1
        security._jwks["at"] = 0.0  # stale
        with mock.patch.object(security, "_fetch_jwks", side_effect=RuntimeError("down")):
            self.assertIsNotNone(self._verify(self._token(), "enforce"))


if __name__ == "__main__":
    unittest.main()
