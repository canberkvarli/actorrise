import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.VERCEL ? "https://api.actorrise.com" : "http://localhost:8000");

/**
 * POST /api/unsubscribe-feedback
 * Forwards the "mind sharing why?" answer to the FastAPI backend, which
 * verifies the signed token and emails it to Canberk.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${API_URL}/api/auth/unsubscribe-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
