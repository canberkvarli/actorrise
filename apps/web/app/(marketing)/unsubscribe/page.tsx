"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

const REASONS = [
  "I get too many emails",
  "The content isn't relevant to me",
  "I'm no longer acting",
  "I didn't sign up for this",
  "Other",
];

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center px-4 py-20">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    if (!email || !token) {
      setStatus("error");
      setErrorMsg("Invalid unsubscribe link.");
      return;
    }

    fetch(
      `/api/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
    )
      .then((res) => {
        if (res.ok) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMsg("This link is invalid or has expired.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Something went wrong. Please try again.");
      });
  }, [email, token]);

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <Link href="/">
            <BrandLogo size="header" />
          </Link>
        </div>

        {/* Loading */}
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
            <p className="text-muted-foreground">Processing your request...</p>
          </div>
        )}

        {/* Success */}
        {status === "success" && (
          <div className="space-y-6">
            <div className="space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <h1 className="text-xl font-semibold text-foreground">
                You&apos;ve been unsubscribed
              </h1>
              <p className="text-muted-foreground text-sm">
                You won&apos;t receive marketing emails from ActorRise anymore.
                You can re-subscribe anytime from your account settings.
              </p>
            </div>

            {/* Optional feedback */}
            {!feedbackSent ? (
              <div className="rounded-xl border border-border bg-card p-5 text-left space-y-4">
                <p className="text-sm font-medium text-foreground">
                  Mind sharing why? (optional)
                </p>
                <div className="space-y-2">
                  {REASONS.map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                        selectedReason === reason
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reason"
                        value={reason}
                        checked={selectedReason === reason}
                        onChange={() => setSelectedReason(reason)}
                        className="sr-only"
                      />
                      <div
                        className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          selectedReason === reason
                            ? "border-primary"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {selectedReason === reason && (
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>
                      {reason}
                    </label>
                  ))}
                </div>
                {selectedReason && (
                  <button
                    onClick={() => setFeedbackSent(true)}
                    className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B03000] transition-colors"
                  >
                    Submit feedback
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Thanks for letting me know. I appreciate the honesty.
                </p>
              </div>
            )}

            <Link
              href="/"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              Back to ActorRise
            </Link>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">
              Something went wrong
            </h1>
            <p className="text-muted-foreground text-sm">{errorMsg}</p>
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/"
                className="inline-block text-sm font-medium text-primary hover:underline"
              >
                Back to ActorRise
              </Link>
              <a
                href="mailto:canberk@actorrise.com"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Need help? Email canberk@actorrise.com
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
