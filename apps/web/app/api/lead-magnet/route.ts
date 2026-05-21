import { NextResponse } from "next/server";

/**
 * POST /api/lead-magnet
 * Accepts email for the "5 Monologues Casting Directors Would Rather See" lead magnet.
 * Returns 200 on success. Wire to your email provider (Resend, ConvertKit, etc.) or
 * backend signup table via env (e.g. LEAD_MAGNET_WEBHOOK_URL).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    // Optional: send to webhook (e.g. ConvertKit, Resend) for storage
    const webhookUrl = process.env.LEAD_MAGNET_WEBHOOK_URL;
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "5_monologues" }),
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
