import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.VERCEL ? "https://api.actorrise.com" : "http://localhost:8000");

/**
 * GET /api/unsubscribe?email=...&token=...
 * Proxies the unsubscribe request to the FastAPI backend and returns JSON.
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  const token = req.nextUrl.searchParams.get("token");

  if (!email || !token) {
    return NextResponse.json(
      { ok: false, message: "Missing email or token" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `${API_URL}/api/auth/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" } }
    );

    const data = await res.json().catch(() => null);

    if (res.ok) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { ok: false, message: data?.message || "Invalid or expired link" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
