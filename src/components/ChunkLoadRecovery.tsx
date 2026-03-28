"use client";

import { useEffect } from "react";

const STORAGE_KEY = "repto_chunk_reload_ts";
/** Avoid reload loops if the dev server is down or chunks keep failing. */
const COOLDOWN_MS = 15_000;

function shouldReloadForChunkFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("loading chunk") ||
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("importing a module script failed")
  );
}

/**
 * In `next dev`, webpack can emit new chunk filenames after rebuilds or long idle periods.
 * The tab may still reference old URLs → 404 on /_next/static/*. One full reload fetches
 * fresh document + correct chunk names. Production builds use hashed filenames too; same
 * recovery helps after deploys.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const tryReload = () => {
      const now = Date.now();
      const last = Number(sessionStorage.getItem(STORAGE_KEY) || "0");
      if (now - last < COOLDOWN_MS) return;
      sessionStorage.setItem(STORAGE_KEY, String(now));
      window.location.reload();
    };

    const onResourceError = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const url =
        t.tagName === "SCRIPT"
          ? (t as HTMLScriptElement).src
          : t.tagName === "LINK"
            ? (t as HTMLLinkElement).href
            : "";
      if (!url || !url.includes("/_next/static/")) return;
      tryReload();
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e.reason && (e.reason as Error).message) ?? e.reason ?? "");
      if (shouldReloadForChunkFailure(msg)) tryReload();
    };

    window.addEventListener("error", onResourceError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onResourceError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
