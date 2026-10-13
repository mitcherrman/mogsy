"""Mint an HS256 Supabase-shaped JWT for the local test user (aud=authenticated).

  python mint_token.py                 # prints the token
  python mint_token.py --json          # prints the E2E persona JSON for localStorage
  python mint_token.py --sub <uuid>    # another user
"""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
import jwt

def mint(sub=C.TEST_USER_ID, email=C.TEST_USER_EMAIL, ttl=12 * 3600):
    now = int(time.time())
    claims = {
        "sub": sub, "aud": "authenticated", "role": "authenticated",
        "email": email, "iat": now, "exp": now + ttl,
        "is_anonymous": False,
        "app_metadata": {"provider": "email"}, "user_metadata": {},
    }
    return jwt.encode(claims, C.secret(), algorithm="HS256")

if __name__ == "__main__":
    sub = C.TEST_USER_ID
    if "--sub" in sys.argv:
        sub = sys.argv[sys.argv.index("--sub") + 1]
    tok = mint(sub)
    if "--json" in sys.argv:
        print(json.dumps({"token": tok,
                          "user": {"id": sub, "email": C.TEST_USER_EMAIL, "is_anonymous": False},
                          "admin": False}))
    else:
        print(tok)
