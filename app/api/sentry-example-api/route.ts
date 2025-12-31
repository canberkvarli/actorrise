import * as Sentry from "@sentry/nextjs";
export const dynamic = "force-dynamic";

class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}

// A faulty API route to test Sentry's error monitoring
export async function GET() {
  Sentry.captureMessage("Sentry example API called", "info");
  throw new SentryExampleAPIError(
    "This error is raised on the backend called by the example page.",
  );
}
