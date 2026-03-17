import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = ["fbcdn.net", "facebook.com", "fbsbx.com", "graph.facebook.com"];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.some((h) => parsed.hostname.endsWith(h));
  } catch {
    return false;
  }
}

/**
 * Proxies media (images, videos) from Facebook CDN to avoid CORS/referrer blocking.
 * Only allows Facebook CDN domains.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  let url = req.nextUrl.searchParams.get("url");
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  url = url.replace(/&amp;/gi, "&");
  if (url.startsWith("//")) {
    url = "https:" + url;
  }
  if (!isAllowedUrl(url)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const isVideoRequest = /\.(mp4|webm)(\?|$)/i.test(url) || /[?&]mime=video/i.test(url);
    const res = await fetch(url, {
      headers: {
        Referer: "https://www.facebook.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      // Large CDN videos can exceed Next.js' data cache limits; skip fetch caching for media proxying.
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: 502 }
      );
    }

    const contentType =
      res.headers.get("content-type") || "application/octet-stream";
    const body = res.body;

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": isVideoRequest
          ? "public, max-age=3600, s-maxage=3600"
          : "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (err) {
    console.error("[media-proxy] Fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch media" },
      { status: 502 }
    );
  }
}
