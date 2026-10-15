"""Mint an HS256 Supabase-shaped JWT for a rig persona; --json prints the E2E persona.

  python mint_token.py free|premium [--json]
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
import jwt


def mint(persona: str, ttl=12 * 3600) -> str:
    p = C.PERSONAS[persona]
    now = int(time.time())
    claims = {"sub": p["sub"], "aud": "authenticated", "role": "authenticated",
              "email": p["email"], "iat": now, "exp": now + ttl, "is_anonymous": False,
              "app_metadata": {"provider": "email"}, "user_metadata": {}}
    return jwt.encode(claims, C.secret(), algorithm="HS256")


if __name__ == "__main__":
    persona = next((a for a in sys.argv[1:] if not a.startswith("--")), "free")
    tok = mint(persona)
    if "--json" in sys.argv:
        p = C.PERSONAS[persona]
        print(json.dumps({"token": tok, "user": {"id": p["sub"], "email": p["email"],
                                                 "is_anonymous": False}, "admin": False}))
    else:
        print(tok)
