"""
Send a test welcome email (for checking template/design).

Usage:
  cd backend && uv run python scripts/send_test_welcome_email.py your@email.com
  cd backend && uv run python scripts/send_test_welcome_email.py your@email.com "Your Name"
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env")
    load_dotenv()
except ImportError:
    pass

from app.services.email.notifications import send_welcome_email


def main():
    email = (sys.argv[1:] or [""])[0].strip()
    name = (sys.argv[2:] or ["Test User"])[0].strip() or "Test User"

    if not email or "@" not in email:
        print("Usage: uv run python scripts/send_test_welcome_email.py <your@email.com> [Your Name]")
        sys.exit(1)

    print(f"Sending test welcome email to {email} (name: {name})...")
    result = send_welcome_email(user_email=email, user_name=name)
    print("Result:", result)
    if result.get("id") and result.get("id") != "mock_welcome_id":
        print("Done. Check your inbox.")
    elif result.get("status") == "disabled":
        print("RESEND_API_KEY not set — email was not sent. Set it in backend/.env to send for real.")
    else:
        print("Sent (or check logs above).")


if __name__ == "__main__":
    main()
