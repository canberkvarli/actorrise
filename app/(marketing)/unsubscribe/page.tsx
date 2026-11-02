"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useT, useTList, type MessageKey } from "@/lib/i18n";

/* Sent to the backend in English whatever the page language, so the
   feedback email stays readable. The visitor sees marketingUnsubscribe.reasons
   at the same index. */
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
  const t = useT();
  const tList = useTList();
  const reasonLabels = tList("marketingUnsubscribe.reasons");
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "resubscribed"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<MessageKey | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const handleFeedback = () => {
    if (!selectedReason || !email || !token) return;
    setSendingFeedback(true);
    fetch("/api/unsubscribe-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        token,
        reason: selectedReason,
        comment: comment.trim() || null,
      }),
    })
      // The thank-you shows either way. They did their part; a failed
      // notification on our side isn't their problem.
      .finally(() => {
        setSendingFeedback(false);
        setFeedbackSent(true);
      });
  };

  const handleUndo = () => {
    if (!email || !token) return;
    setUndoing(true);
    fetch(
      `/api/resubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
    )
      .then((res) => {
        if (res.ok) {
          setStatus("resubscribed");
        } else {
          setErrorMsg("marketingUnsubscribe.errUndo");
        }
      })
      .catch(() => setErrorMsg("marketingUnsubscribe.errUndo"))
      .finally(() => setUndoing(false));
  };

  useEffect(() => {
    if (!email || !token) {
      setStatus("error");
      setErrorMsg("marketingUnsubscribe.errInvalid");
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
          setErrorMsg("marketingUnsubscribe.errExpired");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("marketingUnsubscribe.errGeneric");
      });
  }, [email, token]);

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <Link prefetch={false} href="/">
            <BrandLogo size="header" />
          </Link>
        </div>

        {/* Loading */}
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
            <p className="text-muted-foreground">{t("marketingUnsubscribe.processing")}</p>
          </div>
        )}

        {/* Success */}
        {status === "success" && (
          <div className="space-y-6">
            <div className="space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <h1 className="text-xl font-semibold text-foreground">
                {t("marketingUnsubscribe.doneTitle")}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t("marketingUnsubscribe.doneBody")}
              </p>
              {/* Misclicks are the most common reason people land here.
                  Fix it on the spot instead of sending them to settings. */}
              <p className="text-muted-foreground text-sm">
                {t("marketingUnsubscribe.misclick")}{" "}
                <button
                  onClick={handleUndo}
                  disabled={undoing}
                  className="font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {undoing ? t("marketingUnsubscribe.undoing") : t("marketingUnsubscribe.undo")}
                </button>
              </p>
              {errorMsg && (
                <p className="text-destructive text-sm">{t(errorMsg)}</p>
              )}
            </div>

            {/* Optional feedback */}
            {!feedbackSent ? (
              <div className="rounded-xl border border-border bg-card p-5 text-left space-y-4">
                <p className="text-sm font-medium text-foreground">
                  {t("marketingUnsubscribe.why")}
                </p>
                <div className="space-y-2">
                  {REASONS.map((reason, i) => (
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
                      {reasonLabels[i] ?? reason}
                    </label>
                  ))}
                </div>
                {selectedReason && (
                  <>
                    {/* "Other" with no way to say what: the reason people
                        actually wanted to explain was the one we couldn't hear. */}
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      placeholder={
                        selectedReason === "Other"
                          ? t("marketingUnsubscribe.otherPlaceholder")
                          : t("marketingUnsubscribe.commentPlaceholder")
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    />
                    <button
                      onClick={handleFeedback}
                      disabled={sendingFeedback}
                      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {sendingFeedback ? t("marketingUnsubscribe.sending") : t("marketingUnsubscribe.submit")}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  {t("marketingUnsubscribe.thanks")}
                </p>
              </div>
            )}

            <Link prefetch={false}
              href="/"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              {t("marketingUnsubscribe.back")}
            </Link>
          </div>
        )}

        {/* Undone */}
        {status === "resubscribed" && (
          <div className="space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">
              {t("marketingUnsubscribe.backTitle")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("marketingUnsubscribe.backBody")}
            </p>
            <Link prefetch={false}
              href="/"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              {t("marketingUnsubscribe.back")}
            </Link>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">
              {t("marketingUnsubscribe.errorTitle")}
            </h1>
            <p className="text-muted-foreground text-sm">{errorMsg ? t(errorMsg) : ""}</p>
            <div className="flex flex-col items-center gap-2">
              <Link prefetch={false}
                href="/"
                className="inline-block text-sm font-medium text-primary hover:underline"
              >
                {t("marketingUnsubscribe.back")}
              </Link>
              <a
                href="mailto:canberk@actorrise.com"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("marketingUnsubscribe.needHelp", { email: "canberk@actorrise.com" })}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
