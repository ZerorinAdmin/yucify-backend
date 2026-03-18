"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (key && host) {
      posthog.init(key, { api_host: host });
    }
    const ph = posthog as { captureException?: (e: Error, props?: object) => void };
    if (ph.captureException) {
      ph.captureException(error, { digest: error.digest });
    } else {
      posthog.capture("$exception", {
        $exception_message: error.message,
        $exception_type: error.name,
        $exception_stack_trace_raw: error.stack,
        digest: error.digest,
      });
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">
            Something went wrong
          </h1>
          <p className="mt-2 text-muted-foreground">
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
