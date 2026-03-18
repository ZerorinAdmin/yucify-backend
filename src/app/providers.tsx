"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      process.env.NEXT_PUBLIC_POSTHOG_KEY &&
      process.env.NEXT_PUBLIC_POSTHOG_HOST
    ) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        capture_pageview: false,
        capture_exceptions: true,
      });
    }
  }, []);

  useEffect(() => {
    if (pathname && typeof window !== "undefined") {
      posthog.capture("$pageview", { $current_url: window.location.href });
    }
  }, [pathname]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
