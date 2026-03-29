"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  ExternalLink,
  Loader2,
  Bookmark,
  MoreHorizontal,
  Play,
  Copy,
  Download,
  Send,
  LayoutGrid,
  BadgeCheck,
  Check,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  ImageIcon,
  Shapes,
  PanelsTopLeft,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CompetitorAnalysisResult } from "@/lib/ai/competitor-analysis";
import {
  loadSavedAnalysesFromLocalStorage,
  removeSavedAnalysisFromLocalStorageById,
  upsertSavedAnalysisToLocalStorage,
} from "@/lib/adspy/saved-analyses-local";
import worldCountries from "world-countries";

export { SAVED_ANALYSES_CHANGE_EVENT } from "@/lib/adspy/saved-analyses-local";

/** Renders an analysis section in the AI report modal */
function AnalysisSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white/80 p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function formatAnalysisLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatFormatMix(value: Record<string, number> | null | undefined): string {
  if (!value) return "No format mix";
  return Object.entries(value)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key}: ${count}`)
    .join(" · ");
}

function formatRoleLabel(value: string | null | undefined): string {
  switch (value) {
    case "hero":
      return "Primary focus";
    case "supporting":
      return "Supporting angle";
    case "test":
      return "Smaller test";
    default:
      return "Supporting angle";
  }
}

function roleDescription(value: string | null | undefined): string {
  switch (value) {
    case "hero":
      return "This is the biggest active theme in the current ad set.";
    case "supporting":
      return "This theme is important, but not the main push right now.";
    case "test":
      return "This appears to be a lighter experiment or secondary angle.";
    default:
      return "This theme supports the broader campaign mix.";
  }
}

function getDominantFunnelLabel(result: CompetitorAnalysisResult | null): string {
  if (!result?.funnel_stage) return "—";
  const stages: Array<[string, number]> = [
    ["TOF", result.funnel_stage.tof?.count ?? 0],
    ["MOF", result.funnel_stage.mof?.count ?? 0],
    ["BOF", result.funnel_stage.bof?.count ?? 0],
  ];
  stages.sort((a, b) => b[1] - a[1]);
  return stages[0]?.[0] ?? "—";
}

/** Carousel viewer: one image at a time with prev/next arrows and dot indicators */
function CarouselViewer({
  images,
  getDisplayUrl,
  failedMediaUrls,
}: {
  images: string[];
  getDisplayUrl: (url: string | null, failed: Set<string>) => string | null;
  failedMediaUrls: Set<string>;
}) {
  const [idx, setIdx] = useState(0);
  const total = images.length;
  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);
  const imgSrc = getDisplayUrl(images[idx], failedMediaUrls) ?? images[idx];

  return (
    <div className="relative h-full w-full group/carousel">
      <img
        src={imgSrc}
        alt={`Slide ${idx + 1}`}
        className="h-full w-full object-contain transition-opacity duration-300"
        referrerPolicy="no-referrer"
      />
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white opacity-80 hover:opacity-100 transition-opacity hover:bg-black/60"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white opacity-80 hover:opacity-100 transition-opacity hover:bg-black/60"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === idx ? "w-5 bg-white" : "w-2 bg-white/50"
                )}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Platform icons matching AdDetailPanel (Facebook, Instagram, Threads, etc.) */
function PlatformIcon({ platform, className = "h-5 w-5" }: { platform: string; className?: string }) {
  const p = platform.toLowerCase();
  if (p === "instagram") {
    return (
      <span className={cn("inline-flex shrink-0", className)} title="Instagram">
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="2" width="20" height="20" rx="5" stroke="#E1306C" strokeWidth="2" />
          <circle cx="12" cy="12" r="5" stroke="#E1306C" strokeWidth="2" />
          <circle cx="18" cy="6" r="1.5" fill="#E1306C" />
        </svg>
      </span>
    );
  }
  if (p === "facebook") {
    return (
      <span className={cn("inline-flex shrink-0", className)} title="Facebook">
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
          <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" stroke="#1877F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (p === "threads") {
    return (
      <span className={cn("inline-flex shrink-0 text-foreground", className)} title="Threads">
        <svg width="100%" height="100%" viewBox="0 0 192 192" fill="currentColor">
          <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" />
        </svg>
      </span>
    );
  }
  if (p.includes("audience") || p === "audience_network") {
    return (
      <span className={cn("inline-flex shrink-0", className)} title="Audience Network">
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="7" r="4" stroke="#4267B2" strokeWidth="2" />
          <path d="M2 21v-2a4 4 0 014-4h6a4 4 0 014 4v2" stroke="#4267B2" strokeWidth="2" />
          <circle cx="19" cy="7" r="3" stroke="#4267B2" strokeWidth="1.5" />
          <path d="M19 15a4 4 0 013 4v2" stroke="#4267B2" strokeWidth="1.5" />
        </svg>
      </span>
    );
  }
  if (p === "messenger") {
    return (
      <span className={cn("inline-flex shrink-0", className)} title="Messenger">
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.36 2 2 6.13 2 11.7c0 3.41 1.74 6.43 4.4 8.38v3.38l4.03-2.22c1.08.3 2.22.46 3.4.46 5.64 0 10-4.13 10-9.7S17.64 2 12 2z" stroke="#0084FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (p === "whatsapp") {
    return (
      <span className={cn("inline-flex shrink-0", className)} title="WhatsApp">
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" fill="#25D366" />
        </svg>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex shrink-0 rounded bg-muted px-1.5 text-[10px] font-medium", className)} title={platform}>
      {platform.charAt(0)}
    </span>
  );
}

type PageSuggestion = { page_id: string; page_name: string; page_icon?: string; verified_status?: boolean };

const SCRAPE_LOADING_LINES = [
  "Searching the Meta Ad Library...",
  "Scanning ads and creatives...",
  "Matching creatives to ad IDs. This may take a few minutes...",
  "Almost there...",
  "Finalizing results...",
  "Doing detective work so your users can look uncannily informed.",
];

/** Advertiser from Ads Library search - has page_id, no resolve needed */
type AdvertiserResult = {
  page_id: string;
  page_name: string;
  page_icon: string | null;
  verified_status: boolean;
};

type AdCard = {
  ad_id: string;
  page_name: string;
  ad_text: string;
  ad_headline: string | null;
  ad_description: string | null;
  image_url: string | null;
  video_url: string | null;
  carousel_urls: string[];
  display_format: string | null;
  cta: string | null;
  start_date: string | null;
  snapshot_url: string | null;
  landing_page: string | null;
  is_active: boolean | null;
  collation_id: string | null;
  collation_count: number | null;
  publisher_platforms: string[] | null;
  industry: string | null;
};

type AdGroup = { key: string; ads: AdCard[] };

type AdLifecycleBucket = "new" | "scaling" | "winning";

function getActiveDays(startDate: string | null): string {
  if (!startDate) return "?";
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return "0";
  return `${days}`;
}

function getActiveDaysCount(startDate: string | null): number | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  const diffMs = Date.now() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return days < 0 ? 0 : days;
}

function getLifecycleBucket(ad: Pick<AdCard, "start_date" | "is_active" | "collation_count">): AdLifecycleBucket | null {
  const days = getActiveDaysCount(ad.start_date);
  if (days == null) return null;
  if (days <= 7) return "new";
  if (days <= 30) return "scaling";
  return "winning";
}

function getWinningScore(ad: Pick<AdCard, "start_date" | "is_active" | "publisher_platforms" | "collation_count">): number | null {
  const days = getActiveDaysCount(ad.start_date);
  if (days == null) return null;

  let score = Math.min(60, Math.round((Math.min(days, 90) / 90) * 60));
  if (ad.is_active !== false) score += 20;

  const platformCount = ad.publisher_platforms?.length ?? 0;
  if (platformCount >= 3) score += 10;
  else if (platformCount === 2) score += 7;
  else if (platformCount === 1) score += 4;

  const variants = ad.collation_count ?? 0;
  if (variants > 1) score += Math.min(10, (variants - 1) * 5);

  return Math.min(100, score);
}

function getLandingDomain(url: string | null): string {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.split(".").slice(-2).join(".");
  } catch {
    return url.slice(0, 30);
  }
}

function getRepresentativeAdRank(ad: AdCard): number {
  const visualFormat = getVisualFormat(ad);
  const visualScore =
    visualFormat === "Video" ? 40 :
    visualFormat === "Carousel" ? 30 :
    visualFormat === "Image" ? 20 :
    0;
  const copyScore = getDisplayCopy(ad.ad_text) ? 6 : 0;
  const headlineScore = getDisplayCopy(ad.ad_headline) ? 4 : 0;
  const activeScore = ad.is_active === false ? 0 : 3;
  const dateScore = getActiveDaysCount(ad.start_date) ?? 0;
  return visualScore + copyScore + headlineScore + activeScore + Math.min(dateScore, 10);
}

function sortGroupAdsForDisplay(ads: AdCard[]): AdCard[] {
  return [...ads].sort((a, b) => {
    const rankDiff = getRepresentativeAdRank(b) - getRepresentativeAdRank(a);
    if (rankDiff !== 0) return rankDiff;
    const startA = a.start_date ? new Date(a.start_date).getTime() : 0;
    const startB = b.start_date ? new Date(b.start_date).getTime() : 0;
    if (startB !== startA) return startB - startA;
    return a.ad_id.localeCompare(b.ad_id);
  });
}

const FB_CDN_HOSTS = ["fbcdn.net", "fbsbx.com", "facebook.com", "graph.facebook.com"];

/** Reject URLs that are clearly not media (JS, scripts). Prevents broken placeholders. */
function isValidMediaUrl(url: string | null): boolean {
  if (!url?.startsWith("http")) return false;
  if (url.includes("rsrc.php")) return false;
  if (url.includes("static.xx.fbcdn.net")) return false;
  if (/\.js(\?|&|$)/.test(url) || url.endsWith(".js")) return false;
  return true;
}

/** Get displayable video URL or null if invalid. */
function getValidVideoUrl(ad: { video_url: string | null }): string | null {
  return ad.video_url && isValidMediaUrl(ad.video_url) ? ad.video_url : null;
}

/** Get displayable image URL (primary or first carousel) or null if invalid. */
function getValidImageUrl(ad: {
  image_url: string | null;
  carousel_urls?: string[];
}): string | null {
  const url = ad.image_url ?? ad.carousel_urls?.[0];
  return url && isValidMediaUrl(url) ? url : null;
}

/** Get valid carousel URLs only. */
function getValidCarouselUrls(ad: { carousel_urls?: string[] }): string[] {
  const urls = ad.carousel_urls ?? [];
  return urls.filter(isValidMediaUrl);
}

function getVisualFormat(ad: {
  display_format?: string | null;
  image_url: string | null;
  video_url: string | null;
  carousel_urls?: string[];
}): "Video" | "Carousel" | "Image" | "None" {
  const raw = ad.display_format?.toUpperCase();
  if (raw === "VIDEO") return "Video";
  if (raw === "CAROUSEL") return "Carousel";
  if (getValidVideoUrl(ad)) return "Video";
  if (getValidCarouselUrls(ad).length > 1) return "Carousel";
  if (getValidImageUrl(ad)) return "Image";
  return "None";
}

function isFbCdn(url: string | null): boolean {
  if (!url?.startsWith("http")) return false;
  try {
    const hostname = new URL(url).hostname;
    return FB_CDN_HOSTS.some((h) => hostname.endsWith(h));
  } catch {
    return false;
  }
}

/** Proxy URL for Facebook CDN (used when direct load fails or for page logos). */
function getProxyUrl(rawUrl: string | null): string | null {
  if (!rawUrl?.startsWith("http") || !isFbCdn(rawUrl)) return rawUrl;
  return `/api/adspy/media-proxy?url=${encodeURIComponent(rawUrl)}`;
}

/** Use proxy for page logos (Facebook CDN often blocks cross-origin). */
function getLogoDisplayUrl(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  return isFbCdn(logoUrl) ? getProxyUrl(logoUrl) : logoUrl;
}

/** Fallback: Facebook Graph API profile picture when scraper doesn't return one. */
function getPageProfilePictureUrl(pageId: string | null): string | null {
  if (!pageId || !/^\d+$/.test(pageId)) return null;
  return `https://graph.facebook.com/${pageId}/picture`;
}

/** Direct URL or proxy if this URL previously failed to load. Use proxy for fbcdn by default (often blocks direct). */
function getDisplayUrl(
  rawUrl: string | null,
  failedUrls: Set<string>
): string | null {
  if (!rawUrl) return null;
  if (failedUrls.has(rawUrl) && isFbCdn(rawUrl)) {
    return getProxyUrl(rawUrl);
  }
  if (isFbCdn(rawUrl)) {
    return getProxyUrl(rawUrl);
  }
  return rawUrl;
}

/** Format CTA from raw value (e.g. SHOP_NOW → Shop Now). */
function formatCta(cta: string | null): string {
  if (!cta) return "";
  if (cta.includes("_")) {
    return cta
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return cta;
}

function getDisplayCopy(text: string | null | undefined): string {
  return text?.replace(/\{\{[^}]*\}\}/g, "").trim().replace(/\s+/g, " ") ?? "";
}

const RECENT_PAGES_KEY = "adspy_recent_pages";
export const SAVED_BOARDS_KEY = "adspy_saved_boards";
export const SAVED_BOARDS_CHANGE_EVENT = "adspy_saved_boards_change";
const MAX_RECENT_PAGES = 8;

type CountryOption = { code: string; name: string };

type WorldCountry = {
  cca2: string;
  name: { common: string };
};

type SavedBoardAd = AdCard & {
  saved_at: string;
};

type SavedCompetitorAnalysis = {
  id: string;
  page_id: string;
  page_name: string;
  analysis: CompetitorAnalysisResult | SavedMyAdAnalysisPayload;
  ad_count: number | null;
  dominant_format: string | null;
  created_at: string;
  updated_at: string;
};

type SavedMyAdDiagnosis = {
  bottleneck?: string;
  evidence?: string[];
  priority_fix?: {
    headline?: string;
    primary_section?: string;
    follow_section?: string;
    rationale?: string;
  };
  fixes?: Array<{ type?: string; fix?: string }>;
  audits?: {
    body_copy?: { reason?: string; impact?: string; suggestions?: string[] };
    ocr_text?: {
      reason?: string;
      impact?: string;
      evidence?: string[];
      suggestions?: Array<{ line?: string; change_type?: string; based_on?: string }>;
    };
    transcript_0_5s?: {
      reason?: string;
      impact?: string;
      evidence?: string[];
      suggestions?: Array<{ line?: string; change_type?: string; based_on?: string }>;
    };
  };
};

type SavedMyAdAnalysisPayload = {
  surface?: "health_diagnosis";
  ad_id?: string;
  ad_name?: string;
  date_from?: string;
  date_to?: string;
  diagnosis?: SavedMyAdDiagnosis;
};

function isSavedMyAdAnalysis(
  analysis: CompetitorAnalysisResult | SavedMyAdAnalysisPayload
): analysis is SavedMyAdAnalysisPayload {
  return (analysis as SavedMyAdAnalysisPayload)?.surface === "health_diagnosis";
}

const COUNTRIES: CountryOption[] = [
  { code: "WW", name: "Worldwide" },
  ...worldCountries
    .filter((c: WorldCountry) => c.cca2 && c.name?.common)
    .map((c: WorldCountry) => ({
      code: c.cca2,
      name: c.name.common,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
];

function CountrySelect({
  value,
  onChange,
  triggerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  triggerClassName?: string;
}) {
  const [search, setSearch] = useState("");

  const filteredCountries = useMemo(
    () =>
      COUNTRIES.filter((country) =>
        country.name.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "flex items-center justify-between px-3 text-sm font-normal focus:ring-0 focus:ring-offset-0",
          triggerClassName
        )}
      >
        <SelectValue placeholder="Country" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <div className="px-2 py-1.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search country..."
            className="h-8 text-xs"
          />
        </div>
        {filteredCountries.map((country) => (
          <SelectItem key={country.code} value={country.code}>
            {country.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AdSpySearchPanel() {
  const searchParams = useSearchParams();
  const isBoardsView = searchParams.get("view") === "boards";
  const [searchQuery, setSearchQuery] = useState("");
  const [country, setCountry] = useState("WW");
  const [searchResults, setSearchResults] = useState<AdvertiserResult[]>([]);
  const [selectedPage, setSelectedPage] = useState<PageSuggestion | null>(null);
  const [loadingSelectedId, setLoadingSelectedId] = useState<string | null>(null);
  const [ads, setAds] = useState<AdCard[]>([]);
  const [source, setSource] = useState<"cache" | "scrape" | null>(null);
  const [loadingPages, setLoadingPages] = useState(false);
  const [loadingAds, setLoadingAds] = useState(false);
  const [hasLoadedAds, setHasLoadedAds] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "longest">("newest");
  const [failedMediaUrls, setFailedMediaUrls] = useState<Set<string>>(new Set());
  const [selectedGroup, setSelectedGroup] = useState<AdGroup | null>(null);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);
  const [activityNote, setActivityNote] = useState("");
  const [recentPages, setRecentPages] = useState<PageSuggestion[]>([]);
  const [savedBoards, setSavedBoards] = useState<SavedBoardAd[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedCompetitorAnalysis[]>([]);
  const [savedAnalysesLoading, setSavedAnalysesLoading] = useState(false);
  const [loadingLineIndex, setLoadingLineIndex] = useState(0);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeSaving, setAnalyzeSaving] = useState(false);
  const [removeAnalysisLoadingId, setRemoveAnalysisLoadingId] = useState<string | null>(null);
  const [boardsActionError, setBoardsActionError] = useState<string | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<CompetitorAnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [activeAnalysisPageId, setActiveAnalysisPageId] = useState<string | null>(null);
  const [activeAnalysisPageName, setActiveAnalysisPageName] = useState<string | null>(null);
  const [myAdAnalysisOpen, setMyAdAnalysisOpen] = useState(false);
  const [activeMyAdAnalysis, setActiveMyAdAnalysis] = useState<SavedCompetitorAnalysis | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_PAGES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PageSuggestion[];
        if (Array.isArray(parsed)) {
          setRecentPages(parsed.slice(0, MAX_RECENT_PAGES));
        }
      }
    } catch {
      // ignore invalid stored data
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_BOARDS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedBoardAd[];
      if (Array.isArray(parsed)) {
        setSavedBoards(parsed);
      }
    } catch {
      // ignore invalid saved boards data
    }
  }, []);

  function loadSavedAnalyses() {
    setSavedAnalysesLoading(true);
    try {
      const list = loadSavedAnalysesFromLocalStorage() as SavedCompetitorAnalysis[];
      setSavedAnalyses(list);
    } finally {
      setSavedAnalysesLoading(false);
    }
  }

  useEffect(() => {
    loadSavedAnalyses();
  }, []);

  function addToRecent(page: PageSuggestion) {
    setRecentPages((prev) => {
      const filtered = prev.filter((p) => p.page_id !== page.page_id);
      const next = [page, ...filtered].slice(0, MAX_RECENT_PAGES);
      try {
        localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(next));
      } catch {
        // ignore quota exceeded etc.
      }
      return next;
    });
  }

  function persistSavedBoards(next: SavedBoardAd[]) {
    setSavedBoards(next);
    try {
      localStorage.setItem(SAVED_BOARDS_KEY, JSON.stringify(next));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SAVED_BOARDS_CHANGE_EVENT, { detail: next.length }));
      }
    } catch {
      // ignore quota exceeded etc.
    }
  }

  function isSavedAd(adId: string) {
    return savedBoards.some((item) => item.ad_id === adId);
  }

  function isCurrentAnalysisSaved() {
    if (!activeAnalysisPageId) return false;
    return savedAnalyses.some((item) => item.page_id === activeAnalysisPageId);
  }

  function toggleSavedAd(ad: AdCard) {
    const exists = savedBoards.some((item) => item.ad_id === ad.ad_id);
    if (exists) {
      persistSavedBoards(savedBoards.filter((item) => item.ad_id !== ad.ad_id));
      return;
    }
    persistSavedBoards([
      {
        ...ad,
        saved_at: new Date().toISOString(),
      },
      ...savedBoards,
    ]);
  }

  async function handleAnalyzeAds() {
    if (!selectedPage || ads.length < 2) return;
    setActiveAnalysisPageId(selectedPage.page_id);
    setActiveAnalysisPageName(selectedPage.page_name ?? currentBrandName ?? "Competitor");
    setAnalyzeOpen(true);
    setAnalyzeLoading(true);
    setAnalyzeResult(null);
    setAnalyzeError(null);
    try {
      const payload = {
        page_id: selectedPage.page_id,
        page_name: selectedPage.page_name ?? currentBrandName ?? "Competitor",
        ads: ads.map((a) => ({
          ad_id: a.ad_id,
          ad_text: a.ad_text ?? "",
          ad_headline: a.ad_headline,
          ad_description: a.ad_description,
          display_format: a.display_format,
          cta: a.cta,
          is_active: a.is_active,
          landing_page: a.landing_page ?? null,
          start_date: a.start_date ?? null,
          collation_count: a.collation_count ?? null,
          publisher_platforms: a.publisher_platforms ?? null,
        })),
      };
      const res = await fetch("/api/adspy/analyze-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && data.used != null && data.limit != null) {
          throw new Error(
            `Daily AI analysis limit reached (${data.used}/${data.limit} used). Resets at midnight UTC.`
          );
        }
        throw new Error(data.error ?? "Analysis failed");
      }
      setAnalyzeResult(data as CompetitorAnalysisResult);
      window.dispatchEvent(new Event("adspy-usage-refresh"));
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzeLoading(false);
    }
  }

  function handleSaveAnalysis() {
    if (!analyzeResult || !activeAnalysisPageId || !activeAnalysisPageName) return;
    setAnalyzeSaving(true);
    try {
      const adCount =
        typeof analyzeResult.total_active_ads?.count === "number"
          ? analyzeResult.total_active_ads.count
          : null;
      const dominantFormat =
        typeof analyzeResult.total_active_ads?.dominant_format === "string"
          ? analyzeResult.total_active_ads.dominant_format
          : null;
      upsertSavedAnalysisToLocalStorage({
        page_id: activeAnalysisPageId,
        page_name: activeAnalysisPageName,
        analysis: analyzeResult,
        ad_count: adCount,
        dominant_format: dominantFormat,
      });
      loadSavedAnalyses();
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : "Failed to save analysis");
    } finally {
      setAnalyzeSaving(false);
    }
  }

  function openSavedAnalysis(item: SavedCompetitorAnalysis) {
    if (isSavedMyAdAnalysis(item.analysis)) {
      setActiveMyAdAnalysis(item);
      setMyAdAnalysisOpen(true);
      return;
    }
    setActiveAnalysisPageId(item.page_id);
    setActiveAnalysisPageName(item.page_name);
    setAnalyzeError(null);
    setAnalyzeOpen(true);
    setAnalyzeLoading(false);
    setAnalyzeResult(item.analysis as CompetitorAnalysisResult);
  }

  function removeSavedAnalysis(id: string): void {
    setBoardsActionError(null);
    setRemoveAnalysisLoadingId(id);
    try {
      removeSavedAnalysisFromLocalStorageById(id);
      setSavedAnalyses((prev) => prev.filter((a) => a.id !== id));
      if (activeMyAdAnalysis?.id === id) {
        setMyAdAnalysisOpen(false);
        setActiveMyAdAnalysis(null);
      }
    } catch (e) {
      setBoardsActionError(e instanceof Error ? e.message : "Failed to remove saved analysis");
    } finally {
      setRemoveAnalysisLoadingId(null);
    }
  }

  useEffect(() => {
    if (selectedGroup) {
      setSelectedVariationIndex(0);
      setActivityNote("");
    }
  }, [selectedGroup]);

  useEffect(() => {
    if (!loadingAds && loadingSelectedId === null) {
      setLoadingLineIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingLineIndex((idx) => (idx + 1) % SCRAPE_LOADING_LINES.length);
    }, 2200);

    return () => window.clearInterval(timer);
  }, [loadingAds, loadingSelectedId]);

  const filteredAds = useMemo(() => {
    return ads.filter((ad) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "active") return ad.is_active === true;
      return ad.is_active === false;
    });
  }, [ads, statusFilter]);

  const boardAds = useMemo(() => {
    return savedBoards.filter((ad) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "active") return ad.is_active === true;
      return ad.is_active === false;
    });
  }, [savedBoards, statusFilter]);

  const adGroups = useMemo(() => {
    const groupMap = new Map<string, AdCard[]>();
    for (const ad of filteredAds) {
      const key = ad.collation_id ?? ad.ad_id;
      const list = groupMap.get(key) ?? [];
      list.push(ad);
      groupMap.set(key, list);
    }

    const groups = Array.from(groupMap.entries()).map(([key, ads]) => ({ key, ads: sortGroupAdsForDisplay(ads) }));

    groups.sort((a, b) => {
      const aStart = a.ads[0]?.start_date ? new Date(a.ads[0].start_date as string).getTime() : 0;
      const bStart = b.ads[0]?.start_date ? new Date(b.ads[0].start_date as string).getTime() : 0;

      switch (sortBy) {
        case "newest":
          return bStart - aStart; // newer first
        case "oldest":
          return aStart - bStart; // older first
        case "longest": {
          const now = Date.now();
          const aDuration = aStart ? now - aStart : 0;
          const bDuration = bStart ? now - bStart : 0;
          return bDuration - aDuration; // longest-running first
        }
        default:
          return 0;
      }
    });

    return groups;
  }, [filteredAds, sortBy]);

  const boardGroups = useMemo(() => {
    const groupMap = new Map<string, SavedBoardAd[]>();
    for (const ad of boardAds) {
      const key = ad.collation_id ?? ad.ad_id;
      const list = groupMap.get(key) ?? [];
      list.push(ad);
      groupMap.set(key, list);
    }

    const groups = Array.from(groupMap.entries()).map(([key, ads]) => ({ key, ads: sortGroupAdsForDisplay(ads) }));
    groups.sort((a, b) => {
      const aStart = a.ads[0]?.start_date ? new Date(a.ads[0].start_date as string).getTime() : 0;
      const bStart = b.ads[0]?.start_date ? new Date(b.ads[0].start_date as string).getTime() : 0;

      switch (sortBy) {
        case "newest":
          return bStart - aStart;
        case "oldest":
          return aStart - bStart;
        case "longest": {
          const now = Date.now();
          const aDuration = aStart ? now - aStart : 0;
          const bDuration = bStart ? now - bStart : 0;
          return bDuration - aDuration;
        }
        default:
          return 0;
      }
    });

    return groups;
  }, [boardAds, sortBy]);

  const competitorSavedAnalyses = useMemo(
    () => savedAnalyses.filter((item) => !isSavedMyAdAnalysis(item.analysis)),
    [savedAnalyses]
  );

  const myAdSavedAnalyses = useMemo(
    () => savedAnalyses.filter((item) => isSavedMyAdAnalysis(item.analysis)),
    [savedAnalyses]
  );

  const adStats = useMemo(() => {
    let winning = 0;
    let scaling = 0;
    let newly = 0;
    let imageCount = 0;
    let videoCount = 0;
    let carouselCount = 0;
    let activeDaysSum = 0;
    let activeDaysCount = 0;
    let oldestDays = 0;
    let newestDays: number | null = null;
    let variantsDetected = 0;

    for (const group of adGroups) {
      const ad = group.ads[0];
      const days = getActiveDaysCount(ad.start_date);
      const bucket = getLifecycleBucket(ad);

      if (bucket === "new") newly += 1;
      if (bucket === "scaling") scaling += 1;
      if (bucket === "winning") winning += 1;

      if (days != null) {
        activeDaysSum += days;
        activeDaysCount += 1;
        oldestDays = Math.max(oldestDays, days);
        newestDays = newestDays == null ? days : Math.min(newestDays, days);
      }

      if ((ad.collation_count ?? 0) > 1 || group.ads.length > 1) {
        variantsDetected += 1;
      }

      const visualFormat = getVisualFormat(ad);
      if (visualFormat === "Video") {
        videoCount += 1;
      } else if (visualFormat === "Carousel") {
        carouselCount += 1;
      } else if (visualFormat === "Image") {
        imageCount += 1;
      } else {
        carouselCount += 1;
      }
    }

    return {
      winning,
      scaling,
      newly,
      imageCount,
      videoCount,
      carouselCount,
      avgActiveDays: activeDaysCount > 0 ? Math.round(activeDaysSum / activeDaysCount) : null,
      oldestDays: activeDaysCount > 0 ? oldestDays : null,
      newestDays: newestDays,
      variantsDetected,
    };
  }, [adGroups]);

  const currentBrandName =
    selectedPage?.page_name ||
    (adGroups.length > 0 ? (adGroups[0]?.ads[0]?.page_name ?? null) : null);
  const currentBrandIcon =
    selectedPage
      ? (
          getLogoDisplayUrl(selectedPage.page_icon ?? getPageProfilePictureUrl(selectedPage.page_id) ?? "") ??
          selectedPage.page_icon ??
          getPageProfilePictureUrl(selectedPage.page_id) ??
          null
        )
      : null;
  const creativeStats = useMemo(() => {
    let imageCount = 0;
    let videoCount = 0;
    let carouselCount = 0;

    for (const ad of filteredAds) {
      const visualFormat = getVisualFormat(ad);
      if (visualFormat === "Video") {
        videoCount += 1;
      } else if (visualFormat === "Carousel") {
        carouselCount += 1;
      } else if (visualFormat === "Image") {
        imageCount += 1;
      }
    }

    return { imageCount, videoCount, carouselCount };
  }, [filteredAds]);

  const creativeTotal = filteredAds.length;
  const otherCreativeCount = Math.max(
    0,
    creativeTotal - (creativeStats.imageCount + creativeStats.videoCount + creativeStats.carouselCount)
  );
  const chartImagePct = creativeTotal > 0 ? (creativeStats.imageCount / creativeTotal) * 100 : 0;
  const chartVideoPct = creativeTotal > 0 ? (creativeStats.videoCount / creativeTotal) * 100 : 0;
  const chartCarouselPct = creativeTotal > 0 ? (creativeStats.carouselCount / creativeTotal) * 100 : 0;
  const chartOtherPct = creativeTotal > 0 ? (otherCreativeCount / creativeTotal) * 100 : 0;
  const mediaMixItems = [
    {
      label: "Video",
      value: creativeStats.videoCount,
      pct: Math.round(chartVideoPct),
      color: "bg-violet-400",
      Icon: Clapperboard,
      pill: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
    },
    {
      label: "Image",
      value: creativeStats.imageCount,
      pct: Math.round(chartImagePct),
      color: "bg-rose-400",
      Icon: ImageIcon,
      pill: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
    },
    {
      label: "Carousel",
      value: creativeStats.carouselCount,
      pct: Math.round(chartCarouselPct),
      color: "bg-emerald-400",
      Icon: PanelsTopLeft,
      pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    },
    {
      label: "Other",
      value: otherCreativeCount,
      pct: Math.round(chartOtherPct),
      color: "bg-slate-400",
      Icon: Shapes,
      pill: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    },
  ].filter((item) => item.value > 0);
  const gaugeRadius = 92;
  const gaugeCircumference = Math.PI * gaugeRadius;
  const gaugeTrack = "M 28 112 A 92 92 0 0 1 212 112";
  let gaugeOffset = 0;
  const gaugeSegments = mediaMixItems.map((item) => {
    const segmentLength = creativeTotal > 0 ? (item.value / creativeTotal) * gaugeCircumference : 0;
    const segment = {
      label: item.label,
      color:
        item.label === "Video"
          ? "#a78bfa"
          : item.label === "Image"
            ? "#fb7185"
            : item.label === "Carousel"
              ? "#34d399"
              : "#94a3b8",
      length: segmentLength,
      offset: gaugeOffset,
    };
    gaugeOffset += segmentLength;
    return segment;
  });

  const winningAdGroups = useMemo(() => {
    return [...adGroups]
      .filter((group) => {
        const bucket = getLifecycleBucket(group.ads[0]);
        return bucket === "winning";
      })
      .sort((a, b) => {
        const scoreA = getWinningScore(a.ads[0]) ?? 0;
        const scoreB = getWinningScore(b.ads[0]) ?? 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        const daysA = getActiveDaysCount(a.ads[0].start_date) ?? 0;
        const daysB = getActiveDaysCount(b.ads[0].start_date) ?? 0;
        return daysB - daysA;
      });
  }, [adGroups]);

  const renderAdGroupCard = (
    group: AdGroup,
    featured = false,
    surface: "library" | "boards" = "library"
  ) => {
    const ad = group.ads[0];
    const variationCount = group.ads.length;
    const displayName = ad.page_name && ad.page_name !== "Unknown"
      ? ad.page_name
      : (selectedPage?.page_name ?? "Unknown");
    const activeDays = getActiveDays(ad.start_date);
    const landingDomain = getLandingDomain(ad.landing_page);
    const hasActiveDays = activeDays !== "?";
    const winnerScore = getWinningScore(ad);
    const isSaved = isSavedAd(ad.ad_id);

    return (
      <Card
        key={group.key}
        className={cn(
          "group rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(250,60%,55%)] focus-visible:ring-offset-2",
          featured
            ? "border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 via-background to-background dark:from-emerald-950/20 dark:border-emerald-900/50"
            : "border-border/70"
        )}
        onClick={() => setSelectedGroup(group)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedGroup(group);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-sm font-semibold truncate">{displayName}</p>

              <div className="mt-2 flex flex-col gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex items-center gap-1.5 ${
                      ad.is_active === false
                        ? "text-amber-600 dark:text-amber-500"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        ad.is_active === false ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      aria-hidden
                    />
                    {ad.is_active === false ? "Expired" : "Active"}
                  </span>
                </div>

                {hasActiveDays && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="tracking-wide">Active for</span>
                    <span>{activeDays} days</span>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {variationCount > 1 && (
                    <Badge variant="secondary" className="w-fit text-xs font-medium px-2 py-0.5">
                      {variationCount} variations
                    </Badge>
                  )}
                  {winnerScore != null && (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground cursor-help">
                            Winner score <span className="font-semibold text-foreground">{winnerScore}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px] rounded-xl">
                          A confidence signal that helps surface the advertiser&apos;s winning ads. Higher the score, better is the chance of the ad being a winner.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={cn(
                  "p-1.5 rounded-md hover:bg-muted hover:text-foreground",
                  isSaved ? "text-[hsl(250,60%,55%)]" : "text-muted-foreground"
                )}
                aria-label={isSaved ? "Remove from my boards" : "Save to my boards"}
                onClick={() => toggleSavedAd(ad)}
              >
                <Bookmark className={cn("h-4 w-4", isSaved && "fill-current")} />
              </button>
              <button
                type="button"
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                aria-label="More options"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {ad.snapshot_url && (
                <a
                  href={ad.snapshot_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </CardHeader>

        <div className="relative bg-muted/40 px-4 pt-3">
          <div className="aspect-[4/5] min-h-[200px] w-full overflow-hidden rounded-lg bg-muted/30">
            {getVisualFormat(ad) === "Video" ? (
              <video
                src={getDisplayUrl(ad.video_url!, failedMediaUrls) ?? ad.video_url!}
                poster={getValidImageUrl(ad) ? (getDisplayUrl(getValidImageUrl(ad)!, failedMediaUrls) ?? getValidImageUrl(ad)!) : undefined}
                controls
                className="w-full h-full object-contain"
                muted
                playsInline
                onError={() => {
                  if (ad.video_url && isFbCdn(ad.video_url)) {
                    setFailedMediaUrls((prev) => new Set(prev).add(ad.video_url!));
                  }
                }}
              >
                <source
                  src={getDisplayUrl(ad.video_url!, failedMediaUrls) ?? ad.video_url!}
                  type="video/mp4"
                />
              </video>
            ) : getVisualFormat(ad) === "Carousel" ? (
              <CarouselViewer
                images={getValidCarouselUrls(ad)}
                getDisplayUrl={getDisplayUrl}
                failedMediaUrls={failedMediaUrls}
              />
            ) : getValidImageUrl(ad) ? (
              <img
                src={getDisplayUrl(getValidImageUrl(ad)!, failedMediaUrls) ?? getValidImageUrl(ad)!}
                alt=""
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
                onError={() => {
                  const url = getValidImageUrl(ad);
                  if (url && isFbCdn(url)) {
                    setFailedMediaUrls((prev) => new Set(prev).add(url));
                  }
                }}
              />
            ) : (
              <a
                href={ad.snapshot_url ?? `https://www.facebook.com/ads/library/?id=${ad.ad_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-full flex flex-col items-center justify-center text-muted-foreground rounded-lg bg-gradient-to-b from-muted/80 to-muted/40 border border-muted-foreground/20 hover:from-muted hover:to-muted/60 transition-colors"
              >
                <Play className="h-14 w-14 opacity-50 mb-2" />
                <span className="text-sm font-medium">View on Meta</span>
                <span className="text-xs mt-0.5 opacity-80">Ad creative</span>
              </a>
            )}
          </div>
        </div>
        <CardContent className="p-4 pt-3 space-y-2">
          {surface === "boards" && (
            <div className="mb-1 flex items-center justify-between rounded-xl border border-[hsl(250,60%,90%)] bg-[hsl(250,60%,98%)] px-3 py-2 text-xs text-[hsl(250,60%,35%)]">
              <span className="font-medium">Open saved ad</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
            </div>
          )}
          <p className="text-sm text-foreground mb-2 line-clamp-3">
            {(getDisplayCopy(ad.ad_text) || (
              <span className="text-muted-foreground italic">No caption</span>
            ))}
          </p>

          <div className="space-y-1.5">
            {getDisplayCopy(ad.ad_headline) && (
              <p className="text-sm font-medium text-foreground line-clamp-2">{getDisplayCopy(ad.ad_headline)}</p>
            )}
            {getDisplayCopy(ad.ad_description) && getDisplayCopy(ad.ad_description) !== getDisplayCopy(ad.ad_headline) && (
              <p className="text-xs text-muted-foreground line-clamp-2">{getDisplayCopy(ad.ad_description)}</p>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">
                {getVisualFormat(ad) === "None" ? "—" : getVisualFormat(ad)}
              </Badge>
              {ad.landing_page && (
                <p className="text-xs text-muted-foreground truncate max-w-[60%]">
                  <a
                    href={ad.landing_page}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {landingDomain || ad.landing_page}
                  </a>
                </p>
              )}
            </div>
          </div>

          {ad.cta && (
            <Button
              size="sm"
              variant="secondary"
              className="w-full rounded-lg"
              asChild
              onClick={(e) => e.stopPropagation()}
            >
              <a
                href={ad.landing_page ?? ad.snapshot_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
              >
                {formatCta(ad.cta)}
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  async function handleSearchPages() {
    const query = searchQuery.trim();
    if (!query) {
      setError("Enter a brand or advertiser name to search");
      return;
    }
    setLoadingPages(true);
    setError(null);
    setSearchResults([]);
    setSelectedPage(null);
    setAds([]);
    setHasLoadedAds(false);
    try {
      const params = new URLSearchParams({ q: query, country });
      const res = await fetch(`/api/adspy/search-pages?${params}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Search failed");
      }
      const pages = (data.pages ?? []) as AdvertiserResult[];
      setSearchResults(pages);
      if (pages.length === 0) {
        setError("No advertisers found");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoadingPages(false);
    }
  }

  async function handleSelectAdvertiser(advertiser: AdvertiserResult) {
    setLoadingSelectedId(advertiser.page_id);
    setError(null);
    const page: PageSuggestion = {
      page_id: advertiser.page_id,
      page_name: advertiser.page_name,
      page_icon: advertiser.page_icon ?? undefined,
      verified_status: advertiser.verified_status,
    };
    setSelectedPage(page);
    try {
      await handleLoadAds(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ads");
    } finally {
      setLoadingSelectedId(null);
    }
  }

  async function handleLoadAds(page?: PageSuggestion) {
    const targetPage = page ?? selectedPage;
    if (!targetPage) {
      setError("Select a page first");
      return;
    }
    setSelectedPage(targetPage);
    setLoadingAds(true);
    setError(null);
    setAds([]);
    setHasLoadedAds(false);
    try {
      const params = new URLSearchParams({
        page_id: targetPage.page_id,
        country,
      });
      if (targetPage.page_name) params.set("page_name", targetPage.page_name);
      const res = await fetch(`/api/adspy/ads?${params}`);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && data.used != null && data.limit != null) {
          throw new Error(
            `Daily search limit reached (${data.used}/${data.limit} used). Resets at midnight UTC.`
          );
        }
        throw new Error(data.error ?? "Failed to load ads");
      }
      setFailedMediaUrls(new Set());
      setAds(
        (data.ads ?? []).map((a: Record<string, unknown>) => ({
          ad_id: a.ad_id,
          page_name: a.page_name,
          ad_text: a.ad_text,
          ad_headline: typeof a.ad_headline === "string" ? a.ad_headline : null,
          ad_description: typeof a.ad_description === "string" ? a.ad_description : null,
          image_url: a.image_url ?? (Array.isArray(a.carousel_urls) ? a.carousel_urls[0] : null),
          video_url: a.video_url,
          carousel_urls: Array.isArray(a.carousel_urls) ? (a.carousel_urls as string[]) : [],
          display_format: typeof a.display_format === "string" ? a.display_format : null,
          cta: a.cta,
          start_date: a.start_date,
          snapshot_url: a.snapshot_url,
          landing_page: a.landing_page,
          is_active: a.is_active,
          collation_id: a.collation_id ?? null,
          collation_count: a.collation_count ?? null,
          publisher_platforms: a.publisher_platforms ?? null,
          industry: a.industry ?? null,
        }))
      );
      setSource(data.source ?? null);
      setHasLoadedAds(true);
      addToRecent(targetPage);
      if (data.source === "scrape") {
        window.dispatchEvent(new Event("adspy-usage-refresh"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ads");
    } finally {
      setLoadingAds(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 min-h-full flex-1">
      {isBoardsView && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">My Boards</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Saved competitor ads you want to revisit, compare, or remove later.
              </p>
            </div>
          </div>
          {boardsActionError ? (
            <p className="text-sm text-rose-600">{boardsActionError}</p>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Competitor Analyses</h2>
                <p className="text-sm text-muted-foreground">
                  Saved AI reports you can reopen instantly without regenerating them.
                </p>
              </div>
            </div>

            {savedAnalysesLoading ? (
              <Card className="rounded-2xl border-border/70">
                <CardContent className="py-10 flex items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading saved analyses...
                </CardContent>
              </Card>
            ) : competitorSavedAnalyses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {competitorSavedAnalyses.map((item) => (
                  <div
                    key={item.id}
                    className="group rounded-2xl border border-border/70 bg-white p-5 text-left transition-all hover:border-[hsl(250,60%,55%)] hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openSavedAnalysis(item)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(250,60%,55%)] focus-visible:ring-offset-2 rounded-md"
                      >
                        <p className="mt-2 text-xl font-semibold text-foreground">{item.page_name}</p>
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                        disabled={removeAnalysisLoadingId === item.id}
                        onClick={() => void removeSavedAnalysis(item.id)}
                        aria-label="Remove saved competitor analysis"
                      >
                        {removeAnalysisLoadingId === item.id ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-1.5 h-4 w-4" />
                        )}
                        Unsave
                      </Button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.ad_count != null && (
                        <Badge variant="outline" className="font-normal">
                          {item.ad_count} active ads
                        </Badge>
                      )}
                      <Badge variant="outline" className="font-normal">
                        Saved {new Date(item.updated_at).toLocaleDateString()}
                      </Badge>
                    </div>
                    <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">
                      {(item.analysis as CompetitorAnalysisResult).executive_brief?.summary ??
                        (item.analysis as CompetitorAnalysisResult).strategic_summary?.core_strategy ??
                        "Saved competitor analysis"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <Card className="rounded-2xl border-border/70">
                <CardContent className="py-12 text-center">
                  <p className="text-lg font-semibold text-foreground">No saved analyses yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Run an AI competitor analysis and save it to My Boards to revisit it later.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">My Ads Analyses</h2>
                <p className="text-sm text-muted-foreground">
                  Saved diagnosis reports from your own ads. Open to view the exact same diagnosis details.
                </p>
              </div>
            </div>

            {savedAnalysesLoading ? (
              <Card className="rounded-2xl border-border/70">
                <CardContent className="py-10 flex items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading saved analyses...
                </CardContent>
              </Card>
            ) : myAdSavedAnalyses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {myAdSavedAnalyses.map((item) => {
                  const payload = item.analysis as SavedMyAdAnalysisPayload;
                  return (
                    <div
                      key={item.id}
                      className="group rounded-2xl border border-border/70 bg-white p-5 text-left transition-all hover:border-[hsl(250,60%,55%)] hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => openSavedAnalysis(item)}
                          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(250,60%,55%)] focus-visible:ring-offset-2 rounded-md"
                        >
                          <p className="mt-1 text-xl font-semibold text-foreground">{payload.ad_name ?? item.page_name}</p>
                          {payload.date_from && payload.date_to ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {new Date(payload.date_from).toLocaleDateString()} - {new Date(payload.date_to).toLocaleDateString()}
                            </p>
                          ) : null}
                        </button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-[hsl(250,60%,55%)] hover:bg-muted hover:text-[hsl(250,60%,48%)]"
                          disabled={removeAnalysisLoadingId === item.id}
                          onClick={() => void removeSavedAnalysis(item.id)}
                          aria-label="Remove from my boards"
                        >
                          {removeAnalysisLoadingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Bookmark className="h-4 w-4 fill-current" />
                          )}
                        </Button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge variant="outline" className="font-normal">
                          My ad diagnosis
                        </Badge>
                        <Badge variant="outline" className="font-normal">
                          Saved {new Date(item.updated_at).toLocaleDateString()}
                        </Badge>
                      </div>
                      <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">
                        {payload.diagnosis?.priority_fix?.headline ??
                          payload.diagnosis?.bottleneck ??
                          "Saved ad diagnosis"}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Card className="rounded-2xl border-border/70">
                <CardContent className="py-12 text-center">
                  <p className="text-lg font-semibold text-foreground">No saved ad analyses yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Save diagnosis reports from your ads and they&apos;ll appear here.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Saved Ads</h2>
              <p className="text-sm text-muted-foreground">
                Individual ad creatives bookmarked from the Ad Library.
              </p>
            </div>

            {boardGroups.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
                {boardGroups.map((group) => renderAdGroupCard(group, false, "boards"))}
              </div>
            ) : (
              <Card className="rounded-2xl border-border/70">
                <CardContent className="py-16 text-center">
                  <p className="text-lg font-semibold text-foreground">No saved ads yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Save ads from the Ad Library using the bookmark icon and they&apos;ll appear here.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {!isBoardsView && hasLoadedAds && ads.length > 0 && (
        <div className="space-y-4">
          {/* Back button - return to main ad search page */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearchResults([]);
              setSelectedPage(null);
              setAds([]);
              setHasLoadedAds(false);
              setLoadingPages(false);
              setError(null);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            Back to search
          </Button>

          {/* Advertiser selection (from Meta Ads Library search) */}
          {searchResults.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              <span className="text-sm font-semibold text-foreground">Select an advertiser</span>
              <div className="flex flex-wrap gap-3">
                {searchResults.map((p) => (
                  <button
                    key={p.page_id}
                    type="button"
                    onClick={() => void handleSelectAdvertiser(p)}
                    disabled={loadingAds || loadingSelectedId !== null}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors disabled:opacity-50",
                      loadingSelectedId === p.page_id && "ring-2 ring-primary"
                    )}
                  >
                    <div className="relative h-8 w-8 shrink-0">
                      {(p.page_icon || getPageProfilePictureUrl(p.page_id)) && (
                        <img
                          src={getLogoDisplayUrl(p.page_icon ?? getPageProfilePictureUrl(p.page_id) ?? "") ?? (p.page_icon ?? getPageProfilePictureUrl(p.page_id)) ?? ""}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover absolute inset-0"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextElementSibling?.classList.remove("hidden");
                          }}
                        />
                      )}
                      <div
                        className={cn(
                          "h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium",
                          (p.page_icon || getPageProfilePictureUrl(p.page_id)) ? "hidden" : ""
                        )}
                      >
                        {p.page_name?.charAt(0) ?? "?"}
                      </div>
                    </div>
                    <div className="min-w-0 flex flex-col items-start">
                      <span className="text-sm font-medium truncate max-w-[120px]">{p.page_name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">ID: {p.page_id}</span>
                    </div>
                    {p.verified_status && (
                      <span title="Verified">
                        <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      </span>
                    )}
                    {loadingSelectedId === p.page_id && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Brand heading above ads count */}
          {currentBrandName && (
            <div className="mt-6 flex items-center gap-3">
              <Avatar className="h-11 w-11 border border-border/60 shadow-sm">
                <AvatarImage
                  src={currentBrandIcon ?? undefined}
                  alt={currentBrandName}
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback className="text-sm font-semibold">
                  {currentBrandName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {currentBrandName}
              </h1>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {ads.length >= 50 ? "50+ ads found" : `${ads.length} ad${ads.length !== 1 ? "s" : ""} found`}
              {source && (
                <span className="ml-2 font-normal">
                  ({source === "cache" ? "updated" : "new updates"})
                </span>
              )}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="default"
                size="sm"
                className="bg-[hsl(250,60%,55%)] hover:bg-[hsl(250,60%,48%)]"
                onClick={() => void handleAnalyzeAds()}
                disabled={ads.length < 2}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Analyze Ads
              </Button>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "expired")}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ads</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="expired">Expired only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as "newest" | "oldest" | "longest")}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="longest">Active longest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Performance buckets + creative type breakdown */}
          {adGroups.length > 0 && (
            <div className="mt-3 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.96))] p-5 shadow-[0_16px_50px_rgba(15,23,42,0.06)] dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_30%),linear-gradient(180deg,rgba(10,14,23,0.96),rgba(10,14,23,0.9))]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                      Performance Signals
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Lifecycle buckets based on active days, live status, platform spread, and creative variants.
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Recently launched", value: adStats.newly, tone: "violet", note: "0-7 days" },
                    { label: "Scaling", value: adStats.scaling, tone: "sky", note: "8-30 days" },
                    { label: "Winning", value: adStats.winning, tone: "emerald", note: "31+ days" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={cn(
                        "rounded-2xl border px-4 py-4 shadow-sm",
                        item.tone === "violet" && "border-violet-200/70 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/20",
                        item.tone === "sky" && "border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20",
                        item.tone === "emerald" && "border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                      )}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {item.label}
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <span className="text-3xl font-semibold tracking-tight text-foreground">{item.value}</span>
                        <span className="text-[11px] font-medium text-muted-foreground">{item.note}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {[
                    { label: "Avg active", value: adStats.avgActiveDays != null ? `${adStats.avgActiveDays}d` : "—" },
                    { label: "Oldest", value: adStats.oldestDays != null ? `${adStats.oldestDays}d` : "—" },
                    { label: "Newest launch", value: adStats.newestDays != null ? `${adStats.newestDays}d ago` : "—" },
                    { label: "Variant tests", value: String(adStats.variantsDetected) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-border/60 px-4 py-3 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-5 text-xs text-muted-foreground shadow-[0_16px_50px_rgba(15,23,42,0.06)] dark:bg-[linear-gradient(180deg,rgba(10,14,23,0.96),rgba(10,14,23,0.9))]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    Creative Mix
                  </p>
                </div>
                <div className="mt-5">
                  <div className="flex flex-col items-center justify-center px-4 py-5">
                    <div className="relative h-[132px] w-[240px]">
                      <svg
                        viewBox="0 0 240 132"
                        className="absolute inset-0 h-full w-full"
                        aria-hidden="true"
                      >
                        <path
                          d={gaugeTrack}
                          fill="none"
                          stroke="hsl(var(--muted))"
                          strokeWidth="24"
                          strokeLinecap="butt"
                          opacity="0.45"
                        />
                        {gaugeSegments.map((segment) => (
                          <path
                            key={segment.label}
                            d={gaugeTrack}
                            fill="none"
                            stroke={segment.color}
                            strokeWidth="24"
                            strokeLinecap="butt"
                            strokeDasharray={`${segment.length} ${gaugeCircumference}`}
                            strokeDashoffset={-segment.offset}
                          />
                        ))}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pt-10">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Total ads
                        </span>
                        <span className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
                          {creativeTotal}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 text-sm text-muted-foreground">
                    {mediaMixItems.map((item) => (
                      <div key={item.label} className="inline-flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                        <span className="font-medium text-foreground">{item.label}</span>
                        <span>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {winningAdGroups.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">Winning ads</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your highest-confidence winners, ranked by lifecycle strength and winner score.
                  </p>
                </div>
                <div className="rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                  {winningAdGroups.length} surfaced
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
                {winningAdGroups.map((group) => renderAdGroupCard(group, true))}
              </div>
            </div>
          )}
          <div className="mt-6 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">All ads</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Full creative library for this advertiser.
              </p>
            </div>
          </div>
          {/* Grid: row-based sort order (left→right, top→bottom); items-start for variable card heights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
            {adGroups.map((group) => renderAdGroupCard(group))}
          </div>

          <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
            <DialogContent className="max-w-[95vw] w-[1200px] max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border-border/40 p-0 gap-0">
              {selectedGroup && (() => {
                const ad = selectedGroup.ads[selectedVariationIndex] ?? selectedGroup.ads[0];
                const brandName = ad.page_name && ad.page_name !== "Unknown"
                  ? ad.page_name
                  : (selectedPage?.page_name ?? "Ad");
                const activeDays = getActiveDays(ad.start_date);
                const statusLabel = ad.is_active === false
                  ? "Expired"
                  : activeDays === "?"
                    ? "Active"
                    : `Active for ${activeDays}d`;
                const landingDomain = getLandingDomain(ad.landing_page);
                const visualFormat = getVisualFormat(ad);
                const isSaved = isSavedAd(ad.ad_id);

                const handleCopyLink = () => {
                  const url = ad.snapshot_url ?? ad.landing_page ?? window.location.href;
                  void navigator.clipboard.writeText(url);
                };

                return (
                  <>
                    <DialogHeader className="flex flex-row items-center justify-between gap-4 px-6 py-4 pr-14 border-b shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <DialogTitle className="text-base font-semibold truncate">
                          Ad details {ad.ad_id}
                        </DialogTitle>
                        {ad.snapshot_url && (
                          <a
                            href={ad.snapshot_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="View on Ad Library"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="rounded-lg" onClick={handleCopyLink}>
                          <Copy className="h-4 w-4 mr-1.5" />
                          Copy link
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-lg bg-[hsl(250,60%,55%)] hover:bg-[hsl(250,60%,48%)]"
                          onClick={() => toggleSavedAd(ad)}
                        >
                          <Bookmark className={cn("h-4 w-4 mr-1.5", isSaved && "fill-current")} />
                          {isSaved ? "Remove from board" : "Add to board"}
                        </Button>
                      </div>
                    </DialogHeader>

                    <div className="flex flex-1 min-h-0 overflow-hidden">
                      {/* Left column: Ad creative */}
                      <div className="flex-[1.6] overflow-y-auto p-6 flex flex-col items-center">
                        <Card className="w-full max-w-md rounded-xl overflow-hidden border shadow-sm">
                          <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-semibold text-sm truncate">{brandName}</span>
                                <span
                                  className={cn(
                                    "flex items-center gap-1.5 shrink-0 text-xs px-2 py-0.5 rounded-full",
                                    ad.is_active === false ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  )}
                                >
                                  <span className={cn("h-1.5 w-1.5 rounded-full", ad.is_active === false ? "bg-amber-500" : "bg-emerald-500")} />
                                  {statusLabel}
                                </span>
                              </div>
                            </div>
                            {getDisplayCopy(ad.ad_text) && (
                              <p className="text-sm text-foreground mt-2 line-clamp-3">
                                {getDisplayCopy(ad.ad_text)}
                              </p>
                            )}
                          </CardHeader>
                          <div className="relative aspect-[4/5] bg-muted/50 min-h-[280px]">
                            {visualFormat === "Video" ? (
                              <video
                                src={getDisplayUrl(ad.video_url!, failedMediaUrls) ?? ad.video_url!}
                                poster={getValidImageUrl(ad) ? (getDisplayUrl(getValidImageUrl(ad)!, failedMediaUrls) ?? getValidImageUrl(ad)!) : undefined}
                                controls
                                className="w-full h-full object-contain"
                                muted
                                playsInline
                              />
                            ) : visualFormat === "Carousel" ? (
                              <CarouselViewer
                                images={getValidCarouselUrls(ad)}
                                getDisplayUrl={getDisplayUrl}
                                failedMediaUrls={failedMediaUrls}
                              />
                            ) : getValidImageUrl(ad) ? (
                              <img
                                src={getDisplayUrl(getValidImageUrl(ad)!, failedMediaUrls) ?? getValidImageUrl(ad)!}
                                alt=""
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <a
                                href={ad.snapshot_url ?? `https://www.facebook.com/ads/library/?id=${ad.ad_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-muted/80 to-muted/40 hover:from-muted hover:to-muted/60 transition-colors"
                              >
                                <Play className="h-14 w-14 opacity-50 mb-2" />
                                <span className="text-sm font-medium text-muted-foreground">View on Meta</span>
                                <span className="text-xs mt-0.5 opacity-80">Ad creative</span>
                              </a>
                            )}
                          </div>
                          <CardContent className="p-4 pt-3">
                            <div className="space-y-1.5 mb-3">
                              {getDisplayCopy(ad.ad_headline) && (
                                <p className="text-sm font-medium text-foreground">{getDisplayCopy(ad.ad_headline)}</p>
                              )}
                              {getDisplayCopy(ad.ad_description) && getDisplayCopy(ad.ad_description) !== getDisplayCopy(ad.ad_headline) && (
                                <p className="text-xs text-muted-foreground">{getDisplayCopy(ad.ad_description)}</p>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {landingDomain && <span>{landingDomain}</span>}
                                {ad.industry && <span>{ad.industry}</span>}
                              </div>
                              {ad.cta && (
                                <Button size="sm" variant="secondary" className="rounded-lg shrink-0" asChild>
                                  <a href={ad.landing_page ?? ad.snapshot_url ?? "#"} target="_blank" rel="noopener noreferrer">
                                    {formatCta(ad.cta)}
                                  </a>
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                        {selectedGroup.ads.length > 1 && (
                          <div className="flex gap-2 mt-4 overflow-x-auto pb-2 w-full max-w-md justify-center">
                            {selectedGroup.ads.map((v, i) => (
                              <button
                                key={v.ad_id}
                                type="button"
                                onClick={() => setSelectedVariationIndex(i)}
                                className={cn(
                                  "shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors",
                                  selectedVariationIndex === i ? "border-primary" : "border-transparent hover:border-muted-foreground/50"
                                )}
                              >
                                {getValidImageUrl(v) ? (
                                  <img src={getDisplayUrl(getValidImageUrl(v)!, failedMediaUrls) ?? getValidImageUrl(v)!} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <div className="w-full h-full bg-muted flex items-center justify-center">
                                    <Play className="h-5 w-5 opacity-50" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 mt-3">
                          <Button variant="ghost" size="icon" className="h-9 w-9" title="Download">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Right column: Details + Activity */}
                      <div className="flex-[1] border-l overflow-y-auto flex flex-col min-w-0">
                        <div className="p-6 space-y-6">
                          <div>
                            <h3 className="text-sm font-semibold mb-4">Details</h3>
                            <div className="space-y-4">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Brand</p>
                                <p className="text-sm font-medium flex items-center gap-2">
                                  {brandName}
                                </p>
                              </div>
                              {ad.industry && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Industry</p>
                                  <p className="text-sm">{ad.industry}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Status</p>
                                <p className="text-sm flex items-center gap-1.5">
                                  {ad.is_active === false ? (
                                    <>
                                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                                      Expired
                                    </>
                                  ) : (
                                    <>
                                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                      {statusLabel}
                                    </>
                                  )}
                                </p>
                              </div>
                              {ad.landing_page && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Landing page</p>
                                  <a
                                    href={ad.landing_page}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-primary hover:underline break-all"
                                  >
                                    {ad.landing_page}
                                  </a>
                                </div>
                              )}
                              {ad.publisher_platforms && ad.publisher_platforms.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Platforms</p>
                                  <div className="flex items-center gap-3">
                                    {ad.publisher_platforms.map((p) => (
                                      <PlatformIcon key={p} platform={p} className="h-6 w-6" />
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Visual Format</p>
                                <Badge variant="secondary" className="font-normal">
                                  <LayoutGrid className="h-3.5 w-3.5 mr-1" />
                                  {visualFormat}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h3 className="text-sm font-semibold mb-3">Activity</h3>
                            <div className="flex gap-2">
                              <Textarea
                                placeholder="Share your thoughts..."
                                value={activityNote}
                                onChange={(e) => setActivityNote(e.target.value)}
                                className="min-h-[80px] resize-none"
                              />
                              <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0 self-end" title="Submit">
                                <Send className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>

          {/* AI Analysis modal */}
          <Dialog
            open={analyzeOpen}
            onOpenChange={(open) => !open && (setAnalyzeOpen(false), setAnalyzeError(null), setAnalyzeResult(null), setActiveAnalysisPageId(null), setActiveAnalysisPageName(null))}
          >
            <DialogContent className="flex max-h-[92vh] w-[1120px] max-w-[94vw] flex-col gap-0 overflow-hidden rounded-[28px] border-border/40 p-0">
              <DialogHeader className="shrink-0 space-y-0 border-b bg-gradient-to-r from-white via-white to-[hsl(250,60%,98%)] px-4 pb-4 pt-5 pr-14 text-left sm:px-7 sm:py-5 sm:pr-[5.5rem]">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 max-w-full sm:pr-2">
                    <DialogTitle className="text-left text-lg leading-snug sm:text-xl">
                      <span className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 shrink-0 text-[hsl(250,60%,55%)]" />
                          <span className="font-semibold tracking-tight">AI Competitor Analysis</span>
                        </span>
                        {(activeAnalysisPageName ?? currentBrandName) && (
                          <span className="text-base font-normal text-muted-foreground sm:text-xl">
                            <span className="hidden sm:inline">— </span>
                            {activeAnalysisPageName ?? currentBrandName}
                          </span>
                        )}
                      </span>
                    </DialogTitle>
                    <p className="mt-2 text-sm text-muted-foreground">
                      A strategic report on the competitor&apos;s active ads, message patterns, funnel mix, and exploitable gaps.
                    </p>
                  </div>
                  {analyzeResult && (
                    <Button
                      type="button"
                      variant={isCurrentAnalysisSaved() ? "secondary" : "default"}
                      className={cn(
                        "h-10 w-full shrink-0 sm:h-9 sm:w-auto sm:self-start",
                        !isCurrentAnalysisSaved() && "bg-[hsl(250,60%,55%)] hover:bg-[hsl(250,60%,48%)]"
                      )}
                      onClick={() => void handleSaveAnalysis()}
                      disabled={analyzeSaving || !activeAnalysisPageId || !activeAnalysisPageName}
                    >
                      {analyzeSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Bookmark className={cn("mr-2 h-4 w-4", isCurrentAnalysisSaved() && "fill-current")} />
                      )}
                      {isCurrentAnalysisSaved() ? "Saved to My Boards" : "Save to My Boards"}
                    </Button>
                  )}
                </div>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {analyzeLoading && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-[hsl(250,60%,55%)]" />
                    <p className="text-sm text-muted-foreground">Analyzing ads with AI...</p>
                  </div>
                )}
                {analyzeError && !analyzeLoading && (
                  <div className="p-6">
                    <p className="text-sm text-rose-600">{analyzeError}</p>
                  </div>
                )}
                {analyzeResult && !analyzeLoading && (
                  <div className="flex-1 min-h-0 overflow-y-auto px-7 py-5">
                    <div className="space-y-6 pr-4">
                      <AnalysisSection
                        title="Executive Brief"
                        subtitle="Start here. This is the high-level read on what the competitor is selling, who they are speaking to, and how they appear to convert demand."
                      >
                        <p className="text-sm leading-6">{analyzeResult.executive_brief?.summary}</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-border/50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audience</p>
                            <p className="mt-1 text-sm">{analyzeResult.executive_brief?.audience ?? "—"}</p>
                          </div>
                          <div className="rounded-lg border border-border/50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversion Motion</p>
                            <p className="mt-1 text-sm">{analyzeResult.executive_brief?.conversion_motion ?? "—"}</p>
                          </div>
                        </div>
                        {Boolean(analyzeResult.executive_brief?.moat_signals?.length) && (
                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Moat signals</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {analyzeResult.executive_brief?.moat_signals.map((item: string) => (
                                <Badge key={item} variant="secondary" className="font-normal">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {Boolean(analyzeResult.executive_brief?.vulnerabilities?.length) && (
                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vulnerabilities</p>
                            <ul className="mt-2 space-y-1.5 text-sm">
                              {analyzeResult.executive_brief?.vulnerabilities.map((item: string, i: number) => (
                                <li key={i} className="flex gap-2">
                                  <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </AnalysisSection>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active ads</p>
                          <p className="mt-2 text-2xl font-semibold">{analyzeResult.total_active_ads?.count ?? 0}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dominant format</p>
                          <p className="mt-2 text-2xl font-semibold capitalize">{analyzeResult.total_active_ads?.dominant_format ?? "—"}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Main funnel stage</p>
                          <p className="mt-2 text-2xl font-semibold">{getDominantFunnelLabel(analyzeResult)}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary lever</p>
                          <p className="mt-2 text-lg font-semibold leading-6">
                            {formatAnalysisLabel(analyzeResult.offers_strategy?.most_used ?? "—")}
                          </p>
                        </div>
                      </div>
                      <AnalysisSection
                        title="1. Total Active Ads & Format"
                        subtitle="This shows how much creative is live right now and which format the competitor is leaning on most heavily."
                      >
                        <p className="text-sm">
                          <strong>{analyzeResult.total_active_ads?.count ?? 0}</strong> active ads. Dominant format:{" "}
                          <strong>{analyzeResult.total_active_ads?.dominant_format ?? "—"}</strong>
                        </p>
                        {analyzeResult.total_active_ads?.by_format && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {Object.entries(analyzeResult.total_active_ads.by_format)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">{analyzeResult.total_active_ads?.scaling_signal}</p>
                        {Boolean(analyzeResult.total_active_ads?.evidence?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.total_active_ads?.evidence.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="2. Funnel Stage (TOF / MOF / BOF)"
                        subtitle="TOF means broad awareness, MOF means education and persuasion, and BOF means direct conversion pressure."
                      >
                        {analyzeResult.funnel_stage && (
                          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3 md:gap-3">
                            <div className="min-w-0 break-words rounded-xl border border-border/60 bg-white p-4">
                              <p className="font-medium">TOF</p>
                              <p className="text-xs text-muted-foreground">Broad awareness</p>
                              <p className="text-muted-foreground">{analyzeResult.funnel_stage.tof?.count ?? 0} ({analyzeResult.funnel_stage.tof?.pct ?? 0}%)</p>
                              <p className="mt-1 text-xs leading-relaxed">{analyzeResult.funnel_stage.tof?.summary}</p>
                              {Boolean(analyzeResult.funnel_stage.tof?.examples?.length) && (
                                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                                  {analyzeResult.funnel_stage.tof?.examples.slice(0, 2).map((item: string, i: number) => (
                                    <li key={i} className="break-words">{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="min-w-0 break-words rounded-xl border border-border/60 bg-white p-4">
                              <p className="font-medium">MOF</p>
                              <p className="text-xs text-muted-foreground">Education + persuasion</p>
                              <p className="text-muted-foreground">{analyzeResult.funnel_stage.mof?.count ?? 0} ({analyzeResult.funnel_stage.mof?.pct ?? 0}%)</p>
                              <p className="mt-1 text-xs leading-relaxed">{analyzeResult.funnel_stage.mof?.summary}</p>
                              {Boolean(analyzeResult.funnel_stage.mof?.examples?.length) && (
                                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                                  {analyzeResult.funnel_stage.mof?.examples.slice(0, 2).map((item: string, i: number) => (
                                    <li key={i} className="break-words">{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="min-w-0 break-words rounded-xl border border-border/60 bg-white p-4">
                              <p className="font-medium">BOF</p>
                              <p className="text-xs text-muted-foreground">Direct conversion</p>
                              <p className="text-muted-foreground">{analyzeResult.funnel_stage.bof?.count ?? 0} ({analyzeResult.funnel_stage.bof?.pct ?? 0}%)</p>
                              <p className="mt-1 text-xs leading-relaxed">{analyzeResult.funnel_stage.bof?.summary}</p>
                              {Boolean(analyzeResult.funnel_stage.bof?.examples?.length) && (
                                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                                  {analyzeResult.funnel_stage.bof?.examples.slice(0, 2).map((item: string, i: number) => (
                                    <li key={i} className="break-words">{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="3. Product / Theme Breakdown"
                        subtitle="These are the main offers or themes the competitor appears to be pushing. 'Primary focus' means it owns the largest share of active ads."
                      >
                        {Array.isArray(analyzeResult.product_distribution) && analyzeResult.product_distribution.length > 0 ? (
                          <div className="space-y-3">
                            {analyzeResult.product_distribution.map((
                              p: {
                                product_or_theme?: string;
                                ad_count?: number;
                                role?: string;
                                format_mix?: Record<string, number>;
                                evidence?: string[];
                              },
                              i: number
                            ) => (
                              <div key={i} className="rounded-xl border border-border/50 bg-white p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-base font-semibold">{p.product_or_theme ?? "—"}</div>
                                    <p className="mt-1 text-xs text-muted-foreground">{roleDescription(p.role)}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="font-normal">
                                      {p.ad_count ?? 0} ads
                                    </Badge>
                                    <Badge variant="secondary" className="font-normal">
                                      {formatRoleLabel(p.role)}
                                    </Badge>
                                  </div>
                                </div>
                                {analyzeResult.total_active_ads?.count ? (
                                  <div className="mt-3">
                                    <div className="h-2 rounded-full bg-muted">
                                      <div
                                        className="h-2 rounded-full bg-gradient-to-r from-[hsl(250,60%,55%)] to-[hsl(250,60%,70%)]"
                                        style={{
                                          width: `${Math.max(
                                            8,
                                            Math.min(100, ((p.ad_count ?? 0) / analyzeResult.total_active_ads.count) * 100)
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Covers {Math.round(((p.ad_count ?? 0) / analyzeResult.total_active_ads.count) * 100)}% of the active set
                                    </p>
                                  </div>
                                ) : null}
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {formatFormatMix(p.format_mix)}
                                </p>
                                {Boolean(p.evidence?.length) && (
                                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                                    {p.evidence?.slice(0, 2).map((item: string, index: number) => (
                                      <li key={index}>{item}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Could not identify distinct products.</p>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="4. Offer & Proof Strategy"
                        subtitle="This section explains what promise the competitor is making and what proof devices they use to make that promise believable."
                      >
                        <p className="text-sm">Most used: <strong>{formatAnalysisLabel(analyzeResult.offers_strategy?.most_used ?? "—")}</strong></p>
                        {Boolean(analyzeResult.offers_strategy?.dominant_levers?.length) && (
                          <p className="mt-2 text-sm"><strong>Dominant levers:</strong> {analyzeResult.offers_strategy?.dominant_levers.join(", ")}</p>
                        )}
                        {analyzeResult.offers_strategy?.categories && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(analyzeResult.offers_strategy.categories)
                              .filter(([, count]) => count > 0)
                              .map(([key, count]) => (
                                <Badge key={key} variant="secondary" className="font-normal">
                                  {formatAnalysisLabel(key)}: {count}
                                </Badge>
                              ))}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">{analyzeResult.offers_strategy?.summary}</p>
                        {Boolean(analyzeResult.offers_strategy?.evidence?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.offers_strategy?.evidence.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="5. Messaging Analysis"
                        subtitle="These are the repeated phrases and message families that appear across the active ad set."
                      >
                        {analyzeResult.messaging_analysis?.top_phrases && analyzeResult.messaging_analysis.top_phrases.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {analyzeResult.messaging_analysis.top_phrases.slice(0, 10).map((p: { phrase?: string; cluster?: string }, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs font-normal">
                                {p.phrase} ({p.cluster})
                              </Badge>
                            ))}
                          </div>
                        )}
                        {analyzeResult.messaging_analysis?.clusters && (
                          <div className="grid gap-3 md:grid-cols-2 mt-3">
                            {Object.entries(analyzeResult.messaging_analysis.clusters).map(([key, value]) => (
                              <div key={key} className="rounded-lg border border-border/50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {formatAnalysisLabel(key)}
                                </p>
                                <p className="mt-1 text-sm">{value}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground">{analyzeResult.messaging_analysis?.summary}</p>
                        {Boolean(analyzeResult.messaging_analysis?.evidence?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.messaging_analysis?.evidence.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="6. Headline & CTA Patterns"
                        subtitle="Use this to understand how they open attention and what action they want the viewer to take next."
                      >
                        <p className="text-sm">Dominant intent: <strong>{analyzeResult.headline_cta?.dominant_intent ?? "—"}</strong></p>
                        {Boolean(analyzeResult.headline_cta?.recurring_verbs?.length) && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recurring verbs</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {analyzeResult.headline_cta?.recurring_verbs.map((item: string) => (
                                <Badge key={item} variant="secondary" className="font-normal">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {Boolean(analyzeResult.headline_cta?.emotional_triggers?.length) && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emotional triggers</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {analyzeResult.headline_cta?.emotional_triggers.map((item: string) => (
                                <Badge key={item} variant="secondary" className="font-normal">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {Boolean(analyzeResult.headline_cta?.urgency_cues?.length) && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Urgency cues</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {analyzeResult.headline_cta?.urgency_cues.map((item: string) => (
                                <Badge key={item} variant="secondary" className="font-normal">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">{analyzeResult.headline_cta?.summary}</p>
                        {Boolean(analyzeResult.headline_cta?.evidence?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.headline_cta?.evidence.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="7. Creative Angles"
                        subtitle="These are the story formats or presentation styles the competitor appears to be scaling versus lightly testing."
                      >
                        {analyzeResult.creative_angles?.by_angle && (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {Object.entries(analyzeResult.creative_angles.by_angle)
                              .filter(([, count]) => count > 0)
                              .map(([key, count]) => (
                                <Badge key={key} variant="secondary" className="font-normal">
                                  {formatAnalysisLabel(key)}: {count}
                                </Badge>
                              ))}
                          </div>
                        )}
                        {Boolean(analyzeResult.creative_angles?.scaled?.length) && (
                          <p className="text-sm"><strong>Scaled:</strong> {analyzeResult.creative_angles?.scaled.join(", ")}</p>
                        )}
                        {Boolean(analyzeResult.creative_angles?.tested?.length) && (
                          <p className="text-sm mt-2"><strong>Tested:</strong> {analyzeResult.creative_angles?.tested.join(", ")}</p>
                        )}
                        <p className="text-sm text-muted-foreground">{analyzeResult.creative_angles?.summary}</p>
                        {Boolean(analyzeResult.creative_angles?.evidence?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.creative_angles?.evidence.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="8. Hook Patterns"
                        subtitle="Hooks are the first promise or pain point used to stop the scroll. This shows what they rely on most."
                      >
                        <p className="text-sm"><strong>Dominant hook:</strong> {analyzeResult.hook_patterns?.dominant_hook_type ?? "—"}</p>
                        {Boolean(analyzeResult.hook_patterns?.examples?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.hook_patterns?.examples.map((example: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {example}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">{analyzeResult.hook_patterns?.summary}</p>
                      </AnalysisSection>
                      <AnalysisSection
                        title="9. Winning Patterns"
                        subtitle="These are the structures that seem to repeat across stronger or more heavily reused ads."
                      >
                        {Boolean(analyzeResult.winning_patterns?.length) ? (
                          <div className="space-y-3">
                            {analyzeResult.winning_patterns?.map((
                              pattern: { pattern_name?: string; structure?: string[]; frequency?: number },
                              i: number
                            ) => (
                              <div key={i} className="rounded-lg border border-border/50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium">{pattern.pattern_name ?? "Pattern"}</p>
                                  <Badge variant="outline" className="font-normal">
                                    {pattern.frequency ?? 0}x
                                  </Badge>
                                </div>
                                {Boolean(pattern.structure?.length) && (
                                  <p className="mt-2 text-sm text-muted-foreground">{pattern.structure?.join(" -> ")}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No clear winning patterns were returned.</p>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="10. Competitor Playbook"
                        subtitle="Think of this as the likely operating playbook behind the account: what they lead with, how they prove it, and how they move people toward conversion."
                      >
                        {Boolean(analyzeResult.competitor_playbook?.steps?.length) && (
                          <ol className="space-y-1.5 text-sm">
                            {analyzeResult.competitor_playbook?.steps.map((step: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {step}
                              </li>
                            ))}
                          </ol>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">{analyzeResult.competitor_playbook?.summary}</p>
                      </AnalysisSection>
                      <AnalysisSection
                        title="11. Strategic Summary & Exploitable Gaps"
                        subtitle="This is the punchline: what they are betting on, what they may be overusing, and where there is room to beat them."
                      >
                        <p className="text-sm"><strong>Core strategy:</strong> {analyzeResult.strategic_summary?.core_strategy}</p>
                        <p className="text-sm mt-2"><strong>Over-relying on:</strong> {analyzeResult.strategic_summary?.over_relying_on}</p>
                        <p className="text-sm mt-2"><strong>Underutilized:</strong> {analyzeResult.strategic_summary?.underutilized}</p>
                        <ul className="mt-3 space-y-1 text-sm">
                          {analyzeResult.strategic_summary?.exploitable_gaps?.map((g: string, i: number) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-emerald-600 dark:text-emerald-400 shrink-0">{i + 1}.</span>
                              {g}
                            </li>
                          ))}
                        </ul>
                      </AnalysisSection>
                      <AnalysisSection
                        title="12. Recommendations"
                        subtitle="Actionable next steps based on the competitor's current ad mix and visible weaknesses."
                      >
                        <ul className="space-y-1.5 text-sm">
                          {analyzeResult.recommendations?.map((r: string, i: number) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-[hsl(250,60%,55%)] shrink-0">{i + 1}.</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </AnalysisSection>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isBoardsView && (
        <>
          <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
            <DialogContent className="max-w-[95vw] w-[1200px] max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border-border/40 p-0 gap-0">
              {selectedGroup && (() => {
                const ad = selectedGroup.ads[selectedVariationIndex] ?? selectedGroup.ads[0];
                const brandName = ad.page_name && ad.page_name !== "Unknown"
                  ? ad.page_name
                  : (selectedPage?.page_name ?? "Ad");
                const activeDays = getActiveDays(ad.start_date);
                const statusLabel = ad.is_active === false
                  ? "Expired"
                  : activeDays === "?"
                    ? "Active"
                    : `Active for ${activeDays}d`;
                const landingDomain = getLandingDomain(ad.landing_page);
                const visualFormat = getVisualFormat(ad);
                const isSaved = isSavedAd(ad.ad_id);

                const handleCopyLink = () => {
                  const url = ad.snapshot_url ?? ad.landing_page ?? window.location.href;
                  void navigator.clipboard.writeText(url);
                };

                return (
                  <>
                    <DialogHeader className="flex flex-row items-center justify-between gap-4 px-6 py-4 pr-14 border-b shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <DialogTitle className="text-base font-semibold truncate">
                          Ad details {ad.ad_id}
                        </DialogTitle>
                        {ad.snapshot_url && (
                          <a
                            href={ad.snapshot_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="View on Ad Library"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="rounded-lg" onClick={handleCopyLink}>
                          <Copy className="h-4 w-4 mr-1.5" />
                          Copy link
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-lg bg-[hsl(250,60%,55%)] hover:bg-[hsl(250,60%,48%)]"
                          onClick={() => toggleSavedAd(ad)}
                        >
                          <Bookmark className={cn("h-4 w-4 mr-1.5", isSaved && "fill-current")} />
                          {isSaved ? "Remove from board" : "Add to board"}
                        </Button>
                      </div>
                    </DialogHeader>

                    <div className="flex flex-1 min-h-0 overflow-hidden">
                      <div className="flex-[1.6] overflow-y-auto p-6 flex flex-col items-center">
                        <Card className="w-full max-w-md rounded-xl overflow-hidden border shadow-sm">
                          <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-semibold text-sm truncate">{brandName}</span>
                                <span
                                  className={cn(
                                    "flex items-center gap-1.5 shrink-0 text-xs px-2 py-0.5 rounded-full",
                                    ad.is_active === false ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  )}
                                >
                                  <span className={cn("h-1.5 w-1.5 rounded-full", ad.is_active === false ? "bg-amber-500" : "bg-emerald-500")} />
                                  {statusLabel}
                                </span>
                              </div>
                            </div>
                            {getDisplayCopy(ad.ad_text) && (
                              <p className="text-sm text-foreground mt-2 line-clamp-3">
                                {getDisplayCopy(ad.ad_text)}
                              </p>
                            )}
                          </CardHeader>
                          <div className="relative aspect-[4/5] bg-muted/50 min-h-[280px]">
                            {visualFormat === "Video" ? (
                              <video
                                src={getDisplayUrl(ad.video_url!, failedMediaUrls) ?? ad.video_url!}
                                poster={getValidImageUrl(ad) ? (getDisplayUrl(getValidImageUrl(ad)!, failedMediaUrls) ?? getValidImageUrl(ad)!) : undefined}
                                controls
                                className="w-full h-full object-contain"
                                muted
                                playsInline
                              />
                            ) : visualFormat === "Carousel" ? (
                              <CarouselViewer
                                images={getValidCarouselUrls(ad)}
                                getDisplayUrl={getDisplayUrl}
                                failedMediaUrls={failedMediaUrls}
                              />
                            ) : getValidImageUrl(ad) ? (
                              <img
                                src={getDisplayUrl(getValidImageUrl(ad)!, failedMediaUrls) ?? getValidImageUrl(ad)!}
                                alt=""
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <a
                                href={ad.snapshot_url ?? `https://www.facebook.com/ads/library/?id=${ad.ad_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-muted/80 to-muted/40 hover:from-muted hover:to-muted/60 transition-colors"
                              >
                                <Play className="h-14 w-14 opacity-50 mb-2" />
                                <span className="text-sm font-medium text-muted-foreground">View on Meta</span>
                                <span className="text-xs mt-0.5 opacity-80">Ad creative</span>
                              </a>
                            )}
                          </div>
                          <CardContent className="p-4 pt-3">
                            <div className="space-y-1.5 mb-3">
                              {getDisplayCopy(ad.ad_headline) && (
                                <p className="text-sm font-medium text-foreground">{getDisplayCopy(ad.ad_headline)}</p>
                              )}
                              {getDisplayCopy(ad.ad_description) && getDisplayCopy(ad.ad_description) !== getDisplayCopy(ad.ad_headline) && (
                                <p className="text-xs text-muted-foreground">{getDisplayCopy(ad.ad_description)}</p>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {landingDomain && <span>{landingDomain}</span>}
                                {ad.industry && <span>{ad.industry}</span>}
                              </div>
                              {ad.cta && (
                                <Button size="sm" variant="secondary" className="rounded-lg shrink-0" asChild>
                                  <a href={ad.landing_page ?? ad.snapshot_url ?? "#"} target="_blank" rel="noopener noreferrer">
                                    {formatCta(ad.cta)}
                                  </a>
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                        {selectedGroup.ads.length > 1 && (
                          <div className="flex gap-2 mt-4 overflow-x-auto pb-2 w-full max-w-md justify-center">
                            {selectedGroup.ads.map((v, i) => (
                              <button
                                key={v.ad_id}
                                type="button"
                                onClick={() => setSelectedVariationIndex(i)}
                                className={cn(
                                  "shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors",
                                  selectedVariationIndex === i ? "border-primary" : "border-transparent hover:border-muted-foreground/50"
                                )}
                              >
                                {getValidImageUrl(v) ? (
                                  <img src={getDisplayUrl(getValidImageUrl(v)!, failedMediaUrls) ?? getValidImageUrl(v)!} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <div className="w-full h-full bg-muted flex items-center justify-center">
                                    <Play className="h-5 w-5 opacity-50" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 mt-3">
                          <Button variant="ghost" size="icon" className="h-9 w-9" title="Download">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex-[1] border-l overflow-y-auto flex flex-col min-w-0">
                        <div className="p-6 space-y-6">
                          <div>
                            <h3 className="text-sm font-semibold mb-4">Details</h3>
                            <div className="space-y-4">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Brand</p>
                                <p className="text-sm font-medium flex items-center gap-2">{brandName}</p>
                              </div>
                              {ad.industry && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Industry</p>
                                  <p className="text-sm">{ad.industry}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Status</p>
                                <p className="text-sm flex items-center gap-1.5">
                                  {ad.is_active === false ? (
                                    <>
                                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                                      Expired
                                    </>
                                  ) : (
                                    <>
                                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                      {statusLabel}
                                    </>
                                  )}
                                </p>
                              </div>
                              {ad.landing_page && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Landing page</p>
                                  <a
                                    href={ad.landing_page}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-primary hover:underline break-all"
                                  >
                                    {ad.landing_page}
                                  </a>
                                </div>
                              )}
                              {ad.publisher_platforms && ad.publisher_platforms.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Platforms</p>
                                  <div className="flex items-center gap-3">
                                    {ad.publisher_platforms.map((p) => (
                                      <PlatformIcon key={p} platform={p} className="h-6 w-6" />
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Visual Format</p>
                                <Badge variant="secondary" className="font-normal">
                                  <LayoutGrid className="h-3.5 w-3.5 mr-1" />
                                  {visualFormat}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h3 className="text-sm font-semibold mb-3">Activity</h3>
                            <div className="flex gap-2">
                              <Textarea
                                placeholder="Share your thoughts..."
                                value={activityNote}
                                onChange={(e) => setActivityNote(e.target.value)}
                                className="min-h-[80px] resize-none"
                              />
                              <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0 self-end" title="Submit">
                                <Send className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>

          <Dialog
            open={analyzeOpen}
            onOpenChange={(open) => !open && (setAnalyzeOpen(false), setAnalyzeError(null), setAnalyzeResult(null), setActiveAnalysisPageId(null), setActiveAnalysisPageName(null))}
          >
            <DialogContent className="flex max-h-[92vh] w-[1120px] max-w-[94vw] flex-col gap-0 overflow-hidden rounded-[28px] border-border/40 p-0">
              <DialogHeader className="shrink-0 space-y-0 border-b bg-gradient-to-r from-white via-white to-[hsl(250,60%,98%)] px-4 pb-4 pt-5 pr-14 text-left sm:px-7 sm:py-5 sm:pr-[5.5rem]">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 max-w-full sm:pr-2">
                    <DialogTitle className="text-left text-lg leading-snug sm:text-xl">
                      <span className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 shrink-0 text-[hsl(250,60%,55%)]" />
                          <span className="font-semibold tracking-tight">AI Competitor Analysis</span>
                        </span>
                        {(activeAnalysisPageName ?? currentBrandName) && (
                          <span className="text-base font-normal text-muted-foreground sm:text-xl">
                            <span className="hidden sm:inline">— </span>
                            {activeAnalysisPageName ?? currentBrandName}
                          </span>
                        )}
                      </span>
                    </DialogTitle>
                    <p className="mt-2 text-sm text-muted-foreground">
                      A strategic report on the competitor&apos;s active ads, message patterns, funnel mix, and exploitable gaps.
                    </p>
                  </div>
                  {analyzeResult && (
                    <Button
                      type="button"
                      variant={isCurrentAnalysisSaved() ? "secondary" : "default"}
                      className={cn(
                        "h-10 w-full shrink-0 sm:h-9 sm:w-auto sm:self-start",
                        !isCurrentAnalysisSaved() && "bg-[hsl(250,60%,55%)] hover:bg-[hsl(250,60%,48%)]"
                      )}
                      onClick={() => void handleSaveAnalysis()}
                      disabled={analyzeSaving || !activeAnalysisPageId || !activeAnalysisPageName}
                    >
                      {analyzeSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Bookmark className={cn("mr-2 h-4 w-4", isCurrentAnalysisSaved() && "fill-current")} />
                      )}
                      {isCurrentAnalysisSaved() ? "Saved to My Boards" : "Save to My Boards"}
                    </Button>
                  )}
                </div>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {analyzeLoading && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-[hsl(250,60%,55%)]" />
                    <p className="text-sm text-muted-foreground">Analyzing ads with AI...</p>
                  </div>
                )}
                {analyzeError && !analyzeLoading && (
                  <div className="p-6">
                    <p className="text-sm text-rose-600">{analyzeError}</p>
                  </div>
                )}
                {analyzeResult && !analyzeLoading && (
                  <div className="flex-1 min-h-0 overflow-y-auto px-7 py-5">
                    <div className="space-y-6 pr-4">
                      <AnalysisSection
                        title="Executive Brief"
                        subtitle="Start here. This is the high-level read on what the competitor is selling, who they are speaking to, and how they appear to convert demand."
                      >
                        <p className="text-sm leading-6">{analyzeResult.executive_brief?.summary}</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-border/50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audience</p>
                            <p className="mt-1 text-sm">{analyzeResult.executive_brief?.audience ?? "—"}</p>
                          </div>
                          <div className="rounded-lg border border-border/50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversion Motion</p>
                            <p className="mt-1 text-sm">{analyzeResult.executive_brief?.conversion_motion ?? "—"}</p>
                          </div>
                        </div>
                      </AnalysisSection>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active ads</p>
                          <p className="mt-2 text-2xl font-semibold">{analyzeResult.total_active_ads?.count ?? 0}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dominant format</p>
                          <p className="mt-2 text-2xl font-semibold capitalize">{analyzeResult.total_active_ads?.dominant_format ?? "—"}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Main funnel stage</p>
                          <p className="mt-2 text-2xl font-semibold">{getDominantFunnelLabel(analyzeResult)}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary lever</p>
                          <p className="mt-2 text-lg font-semibold leading-6">
                            {formatAnalysisLabel(analyzeResult.offers_strategy?.most_used ?? "—")}
                          </p>
                        </div>
                      </div>
                      <AnalysisSection
                        title="1. Total Active Ads & Format"
                        subtitle="This shows how much creative is live right now and which format the competitor is leaning on most heavily."
                      >
                        <p className="text-sm">
                          <strong>{analyzeResult.total_active_ads?.count ?? 0}</strong> active ads. Dominant format:{" "}
                          <strong>{analyzeResult.total_active_ads?.dominant_format ?? "—"}</strong>
                        </p>
                        {analyzeResult.total_active_ads?.by_format && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {Object.entries(analyzeResult.total_active_ads.by_format)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">{analyzeResult.total_active_ads?.scaling_signal}</p>
                        {Boolean(analyzeResult.total_active_ads?.evidence?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.total_active_ads?.evidence.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="2. Funnel Stage (TOF / MOF / BOF)"
                        subtitle="TOF means broad awareness, MOF means education and persuasion, and BOF means direct conversion pressure."
                      >
                        {analyzeResult.funnel_stage && (
                          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3 md:gap-3">
                            <div className="min-w-0 break-words rounded-xl border border-border/60 bg-white p-4">
                              <p className="font-medium">TOF</p>
                              <p className="text-xs text-muted-foreground">Broad awareness</p>
                              <p className="text-muted-foreground">{analyzeResult.funnel_stage.tof?.count ?? 0} ({analyzeResult.funnel_stage.tof?.pct ?? 0}%)</p>
                              <p className="mt-1 text-xs leading-relaxed">{analyzeResult.funnel_stage.tof?.summary}</p>
                              {Boolean(analyzeResult.funnel_stage.tof?.examples?.length) && (
                                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                                  {analyzeResult.funnel_stage.tof?.examples.slice(0, 2).map((item: string, i: number) => (
                                    <li key={i} className="break-words">{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="min-w-0 break-words rounded-xl border border-border/60 bg-white p-4">
                              <p className="font-medium">MOF</p>
                              <p className="text-xs text-muted-foreground">Education + persuasion</p>
                              <p className="text-muted-foreground">{analyzeResult.funnel_stage.mof?.count ?? 0} ({analyzeResult.funnel_stage.mof?.pct ?? 0}%)</p>
                              <p className="mt-1 text-xs leading-relaxed">{analyzeResult.funnel_stage.mof?.summary}</p>
                              {Boolean(analyzeResult.funnel_stage.mof?.examples?.length) && (
                                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                                  {analyzeResult.funnel_stage.mof?.examples.slice(0, 2).map((item: string, i: number) => (
                                    <li key={i} className="break-words">{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="min-w-0 break-words rounded-xl border border-border/60 bg-white p-4">
                              <p className="font-medium">BOF</p>
                              <p className="text-xs text-muted-foreground">Direct conversion</p>
                              <p className="text-muted-foreground">{analyzeResult.funnel_stage.bof?.count ?? 0} ({analyzeResult.funnel_stage.bof?.pct ?? 0}%)</p>
                              <p className="mt-1 text-xs leading-relaxed">{analyzeResult.funnel_stage.bof?.summary}</p>
                              {Boolean(analyzeResult.funnel_stage.bof?.examples?.length) && (
                                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                                  {analyzeResult.funnel_stage.bof?.examples.slice(0, 2).map((item: string, i: number) => (
                                    <li key={i} className="break-words">{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="3. Product / Theme Breakdown"
                        subtitle="These are the main offers or themes the competitor appears to be pushing. 'Primary focus' means it owns the largest share of active ads."
                      >
                        {Array.isArray(analyzeResult.product_distribution) && analyzeResult.product_distribution.length > 0 ? (
                          <div className="space-y-3">
                            {analyzeResult.product_distribution.map((
                              p: {
                                product_or_theme?: string;
                                ad_count?: number;
                                role?: string;
                                format_mix?: Record<string, number>;
                                evidence?: string[];
                              },
                              i: number
                            ) => (
                              <div key={i} className="rounded-xl border border-border/50 bg-white p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-base font-semibold">{p.product_or_theme ?? "—"}</div>
                                    <p className="mt-1 text-xs text-muted-foreground">{roleDescription(p.role)}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="font-normal">
                                      {p.ad_count ?? 0} ads
                                    </Badge>
                                    <Badge variant="secondary" className="font-normal">
                                      {formatRoleLabel(p.role)}
                                    </Badge>
                                  </div>
                                </div>
                                {analyzeResult.total_active_ads?.count ? (
                                  <div className="mt-3">
                                    <div className="h-2 rounded-full bg-muted">
                                      <div
                                        className="h-2 rounded-full bg-gradient-to-r from-[hsl(250,60%,55%)] to-[hsl(250,60%,70%)]"
                                        style={{
                                          width: `${Math.max(
                                            8,
                                            Math.min(100, ((p.ad_count ?? 0) / analyzeResult.total_active_ads.count) * 100)
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Covers {Math.round(((p.ad_count ?? 0) / analyzeResult.total_active_ads.count) * 100)}% of the active set
                                    </p>
                                  </div>
                                ) : null}
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {formatFormatMix(p.format_mix)}
                                </p>
                                {Boolean(p.evidence?.length) && (
                                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                                    {p.evidence?.slice(0, 2).map((item: string, index: number) => (
                                      <li key={index}>{item}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Could not identify distinct products.</p>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="4. Offer & Proof Strategy"
                        subtitle="This section explains what promise the competitor is making and what proof devices they use to make that promise believable."
                      >
                        <p className="text-sm">Most used: <strong>{formatAnalysisLabel(analyzeResult.offers_strategy?.most_used ?? "—")}</strong></p>
                        {Boolean(analyzeResult.offers_strategy?.dominant_levers?.length) && (
                          <p className="mt-2 text-sm"><strong>Dominant levers:</strong> {analyzeResult.offers_strategy?.dominant_levers.join(", ")}</p>
                        )}
                        {analyzeResult.offers_strategy?.categories && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(analyzeResult.offers_strategy.categories)
                              .filter(([, count]) => count > 0)
                              .map(([key, count]) => (
                                <Badge key={key} variant="secondary" className="font-normal">
                                  {formatAnalysisLabel(key)}: {count}
                                </Badge>
                              ))}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">{analyzeResult.offers_strategy?.summary}</p>
                        {Boolean(analyzeResult.offers_strategy?.evidence?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.offers_strategy?.evidence.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="5. Messaging Analysis"
                        subtitle="These are the repeated phrases and message families that appear across the active ad set."
                      >
                        {analyzeResult.messaging_analysis?.top_phrases && analyzeResult.messaging_analysis.top_phrases.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {analyzeResult.messaging_analysis.top_phrases.slice(0, 10).map((p: { phrase?: string; cluster?: string }, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs font-normal">
                                {p.phrase} ({p.cluster})
                              </Badge>
                            ))}
                          </div>
                        )}
                        {analyzeResult.messaging_analysis?.clusters && (
                          <div className="grid gap-3 md:grid-cols-2 mt-3">
                            {Object.entries(analyzeResult.messaging_analysis.clusters).map(([key, value]) => (
                              <div key={key} className="rounded-lg border border-border/50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {formatAnalysisLabel(key)}
                                </p>
                                <p className="mt-1 text-sm">{value}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground">{analyzeResult.messaging_analysis?.summary}</p>
                        {Boolean(analyzeResult.messaging_analysis?.evidence?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.messaging_analysis?.evidence.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="6. Headline & CTA Patterns"
                        subtitle="Use this to understand how they open attention and what action they want the viewer to take next."
                      >
                        <p className="text-sm">Dominant intent: <strong>{analyzeResult.headline_cta?.dominant_intent ?? "—"}</strong></p>
                        {Boolean(analyzeResult.headline_cta?.recurring_verbs?.length) && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recurring verbs</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {analyzeResult.headline_cta?.recurring_verbs.map((item: string) => (
                                <Badge key={item} variant="secondary" className="font-normal">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {Boolean(analyzeResult.headline_cta?.emotional_triggers?.length) && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emotional triggers</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {analyzeResult.headline_cta?.emotional_triggers.map((item: string) => (
                                <Badge key={item} variant="secondary" className="font-normal">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {Boolean(analyzeResult.headline_cta?.urgency_cues?.length) && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Urgency cues</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {analyzeResult.headline_cta?.urgency_cues.map((item: string) => (
                                <Badge key={item} variant="secondary" className="font-normal">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">{analyzeResult.headline_cta?.summary}</p>
                        {Boolean(analyzeResult.headline_cta?.evidence?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.headline_cta?.evidence.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="7. Creative Angles"
                        subtitle="These are the story formats or presentation styles the competitor appears to be scaling versus lightly testing."
                      >
                        {analyzeResult.creative_angles?.by_angle && (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {Object.entries(analyzeResult.creative_angles.by_angle)
                              .filter(([, count]) => count > 0)
                              .map(([key, count]) => (
                                <Badge key={key} variant="secondary" className="font-normal">
                                  {formatAnalysisLabel(key)}: {count}
                                </Badge>
                              ))}
                          </div>
                        )}
                        {Boolean(analyzeResult.creative_angles?.scaled?.length) && (
                          <p className="text-sm"><strong>Scaled:</strong> {analyzeResult.creative_angles?.scaled.join(", ")}</p>
                        )}
                        {Boolean(analyzeResult.creative_angles?.tested?.length) && (
                          <p className="text-sm mt-2"><strong>Tested:</strong> {analyzeResult.creative_angles?.tested.join(", ")}</p>
                        )}
                        <p className="text-sm text-muted-foreground">{analyzeResult.creative_angles?.summary}</p>
                        {Boolean(analyzeResult.creative_angles?.evidence?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.creative_angles?.evidence.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="8. Hook Patterns"
                        subtitle="Hooks are the first promise or pain point used to stop the scroll. This shows what they rely on most."
                      >
                        <p className="text-sm"><strong>Dominant hook:</strong> {analyzeResult.hook_patterns?.dominant_hook_type ?? "—"}</p>
                        {Boolean(analyzeResult.hook_patterns?.examples?.length) && (
                          <ul className="mt-3 space-y-1.5 text-sm">
                            {analyzeResult.hook_patterns?.examples.map((example: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {example}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">{analyzeResult.hook_patterns?.summary}</p>
                      </AnalysisSection>
                      <AnalysisSection
                        title="9. Winning Patterns"
                        subtitle="These are the structures that seem to repeat across stronger or more heavily reused ads."
                      >
                        {Boolean(analyzeResult.winning_patterns?.length) ? (
                          <div className="space-y-3">
                            {analyzeResult.winning_patterns?.map((
                              pattern: { pattern_name?: string; structure?: string[]; frequency?: number },
                              i: number
                            ) => (
                              <div key={i} className="rounded-lg border border-border/50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium">{pattern.pattern_name ?? "Pattern"}</p>
                                  <Badge variant="outline" className="font-normal">
                                    {pattern.frequency ?? 0}x
                                  </Badge>
                                </div>
                                {Boolean(pattern.structure?.length) && (
                                  <p className="mt-2 text-sm text-muted-foreground">{pattern.structure?.join(" -> ")}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No clear winning patterns were returned.</p>
                        )}
                      </AnalysisSection>
                      <AnalysisSection
                        title="10. Competitor Playbook"
                        subtitle="Think of this as the likely operating playbook behind the account: what they lead with, how they prove it, and how they move people toward conversion."
                      >
                        {Boolean(analyzeResult.competitor_playbook?.steps?.length) && (
                          <ol className="space-y-1.5 text-sm">
                            {analyzeResult.competitor_playbook?.steps.map((step: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                {step}
                              </li>
                            ))}
                          </ol>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">{analyzeResult.competitor_playbook?.summary}</p>
                      </AnalysisSection>
                      <AnalysisSection
                        title="11. Strategic Summary & Exploitable Gaps"
                        subtitle="This is the punchline: what they are betting on, what they may be overusing, and where there is room to beat them."
                      >
                        <p className="text-sm"><strong>Core strategy:</strong> {analyzeResult.strategic_summary?.core_strategy}</p>
                        <p className="text-sm mt-2"><strong>Over-relying on:</strong> {analyzeResult.strategic_summary?.over_relying_on}</p>
                        <p className="text-sm mt-2"><strong>Underutilized:</strong> {analyzeResult.strategic_summary?.underutilized}</p>
                        <ul className="mt-3 space-y-1 text-sm">
                          {analyzeResult.strategic_summary?.exploitable_gaps?.map((g: string, i: number) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-emerald-600 dark:text-emerald-400 shrink-0">{i + 1}.</span>
                              {g}
                            </li>
                          ))}
                        </ul>
                      </AnalysisSection>
                      <AnalysisSection
                        title="12. Recommendations"
                        subtitle="Actionable next steps based on the competitor's current ad mix and visible weaknesses."
                      >
                        <ul className="space-y-1.5 text-sm">
                          {analyzeResult.recommendations?.map((r: string, i: number) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-[hsl(250,60%,55%)] shrink-0">{i + 1}.</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </AnalysisSection>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={myAdAnalysisOpen}
            onOpenChange={(open) => {
              if (!open) {
                setMyAdAnalysisOpen(false);
                setActiveMyAdAnalysis(null);
              }
            }}
          >
            <DialogContent className="flex max-h-[92vh] w-[1120px] max-w-[94vw] flex-col gap-0 overflow-hidden rounded-[28px] border-border/40 p-0">
              <DialogHeader className="shrink-0 space-y-0 border-b bg-white px-4 pb-4 pt-5 pr-14 text-left sm:px-7 sm:py-5 sm:pr-[5.5rem]">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 max-w-full sm:pr-2">
                    <DialogTitle className="text-left text-lg leading-snug sm:text-xl">
                      <span className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 shrink-0 text-[hsl(250,60%,55%)]" />
                        <span className="font-semibold tracking-tight">My Ad Analysis</span>
                      </span>
                    </DialogTitle>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {activeMyAdAnalysis?.page_name ?? "Saved ad diagnosis"}
                    </p>
                  </div>
                  {activeMyAdAnalysis && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 w-auto shrink-0 self-start"
                      disabled={removeAnalysisLoadingId === activeMyAdAnalysis.id}
                      onClick={() => void removeSavedAnalysis(activeMyAdAnalysis.id)}
                    >
                      {removeAnalysisLoadingId === activeMyAdAnalysis.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Remove from My Boards
                    </Button>
                  )}
                </div>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-y-auto px-7 py-5">
                {activeMyAdAnalysis && isSavedMyAdAnalysis(activeMyAdAnalysis.analysis) ? (
                  <div className="space-y-6 pr-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-border/50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date range</p>
                        <p className="mt-1 text-sm">
                          {activeMyAdAnalysis.analysis.date_from ?? "—"} to {activeMyAdAnalysis.analysis.date_to ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bottleneck</p>
                        <p className="mt-1 text-sm">{activeMyAdAnalysis.analysis.diagnosis?.bottleneck ?? "—"}</p>
                      </div>
                    </div>

                    <AnalysisSection title="Evidence">
                      {activeMyAdAnalysis.analysis.diagnosis?.evidence?.length ? (
                        <ul className="space-y-1.5 text-sm">
                          {activeMyAdAnalysis.analysis.diagnosis?.evidence?.map((line, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">No evidence lines returned.</p>
                      )}
                    </AnalysisSection>

                    <AnalysisSection title="Priority fix">
                      <p className="text-sm font-medium">
                        {activeMyAdAnalysis.analysis.diagnosis?.priority_fix?.headline ?? "No priority guidance available."}
                      </p>
                      {activeMyAdAnalysis.analysis.diagnosis?.priority_fix?.rationale ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {activeMyAdAnalysis.analysis.diagnosis?.priority_fix?.rationale}
                        </p>
                      ) : null}
                    </AnalysisSection>

                    <AnalysisSection title="Fixes to ship">
                      {activeMyAdAnalysis.analysis.diagnosis?.fixes?.length ? (
                        <ul className="space-y-2 text-sm">
                          {activeMyAdAnalysis.analysis.diagnosis?.fixes?.map((fix, i) => (
                            <li key={i}>
                              <span className="font-medium">{fix.type ?? "Fix"}:</span> {fix.fix ?? "—"}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">No fixes returned.</p>
                      )}
                    </AnalysisSection>

                    <AnalysisSection title="On-image text analysis">
                      <p className="text-sm text-muted-foreground">
                        {activeMyAdAnalysis.analysis.diagnosis?.audits?.ocr_text?.reason ?? "No OCR analysis available."}
                      </p>
                      {activeMyAdAnalysis.analysis.diagnosis?.audits?.ocr_text?.suggestions?.length ? (
                        <ul className="mt-3 space-y-2 text-sm">
                          {activeMyAdAnalysis.analysis.diagnosis?.audits?.ocr_text?.suggestions?.map((s, i) => (
                            <li key={i} className="rounded-md border border-border/50 bg-muted/20 p-3">
                              <p className="font-medium">{s.line ?? "—"}</p>
                              {s.based_on ? (
                                <p className="mt-1 text-xs text-muted-foreground">{s.based_on}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </AnalysisSection>

                    <AnalysisSection title="Transcript analysis">
                      <p className="text-sm text-muted-foreground">
                        {activeMyAdAnalysis.analysis.diagnosis?.audits?.transcript_0_5s?.reason ??
                          "No transcript analysis available."}
                      </p>
                    </AnalysisSection>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No saved diagnosis found.</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Loading state when fetching ads (shown in results view too) */}
      {(loadingAds || loadingSelectedId !== null) && selectedPage && hasLoadedAds && (
        <Card className="rounded-2xl border-sky-200/70 bg-[radial-gradient(circle_at_top_left,rgba(186,230,253,0.3),transparent_40%)] dark:border-sky-900/40 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_40%)]">
          <CardContent className="py-8">
            <div className="flex items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500 shrink-0" />
              <div>
                <p className="font-medium text-foreground">Searching the page... This may take a minute.</p>
                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium mt-0.5">Please stay on this page.</p>
                <p className="text-xs text-muted-foreground mt-1">{SCRAPE_LOADING_LINES[loadingLineIndex]}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isBoardsView && hasLoadedAds && ads.length === 0 && !loadingAds && loadingSelectedId === null && searchResults.length === 0 && (
        <Card className="rounded-2xl border-border/70">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No ads found for this page.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a different country filter or check back later.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Search page (hero) - shown for entire search flow until ads are loaded */}
      {!isBoardsView && !hasLoadedAds && (
        <>
          {/* Spacer - positions search section slightly towards center */}
          <div className="flex-1 min-h-[1px] max-h-32" />

          {/* Search section */}
          <div className="flex flex-col items-center text-center pt-8 shrink-0">
            <div className="w-632 h-64 mb-4 flex items-center justify-center">
              <img
                src="/spy-illustration.png"
                alt=""
                className="w-full h-full object-contain"
              />
            </div>
            <h2 className="text-4xl font-medium tracking-tight text-foreground mb-4">
              Spy your competitors
            </h2>
            <div className="w-full max-w-2xl">
              <div className="flex rounded-xl border border-input bg-background overflow-hidden shadow-sm">
                <Input
                  id="search-terms"
                  placeholder="Type page name (e.g. Nike)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchPages()}
                  className="flex-1 border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 h-12 px-4"
                />
                <div className="border-l border-input flex items-center">
                  <CountrySelect
                    value={country}
                    onChange={setCountry}
                    triggerClassName="w-[170px] h-12 rounded-none bg-transparent border-0"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 rounded-none shrink-0"
                    onClick={handleSearchPages}
                    disabled={loadingPages}
                  >
                    {loadingPages ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Search className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </div>

              {loadingPages && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Searching for advertisers... Please stay on this page.</span>
                </div>
              )}

              {/* Advertiser selection: [logo] page_name, page_id, verified - user selects before loading ads */}
              {searchResults.length > 0 && (
                <div className="mt-6 w-full max-w-2xl text-left">
                  <p className="text-sm font-semibold text-foreground mb-4">Select an advertiser</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {searchResults.map((p) => (
                      <button
                        key={p.page_id}
                        type="button"
                        onClick={() => void handleSelectAdvertiser(p)}
                        disabled={loadingAds || loadingSelectedId !== null}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border border-border bg-card text-left hover:border-primary/50 hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none",
                          loadingSelectedId === p.page_id && "ring-2 ring-primary"
                        )}
                      >
                        <div className="relative h-12 w-12 shrink-0">
                          {(p.page_icon || getPageProfilePictureUrl(p.page_id)) && (
                            <img
                              src={getLogoDisplayUrl(p.page_icon ?? getPageProfilePictureUrl(p.page_id) ?? "") ?? (p.page_icon ?? getPageProfilePictureUrl(p.page_id)) ?? ""}
                              alt=""
                              className="h-12 w-12 rounded-full object-cover absolute inset-0"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (p.page_icon && isFbCdn(p.page_icon) && !img.src.includes("/api/adspy/media-proxy")) {
                                  img.src = getProxyUrl(p.page_icon) ?? p.page_icon;
                                } else {
                                  img.style.display = "none";
                                  img.nextElementSibling?.classList.remove("hidden");
                                }
                              }}
                            />
                          )}
                          <div
                            className={cn(
                              "h-12 w-12 rounded-full bg-muted flex items-center justify-center",
                              (p.page_icon || getPageProfilePictureUrl(p.page_id)) ? "hidden" : ""
                            )}
                          >
                            <span className="text-lg font-medium text-muted-foreground">
                              {p.page_name?.charAt(0) ?? "?"}
                            </span>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground truncate">{p.page_name}</span>
                            {p.verified_status && (
                              <span className="inline-flex items-center gap-1 shrink-0 text-emerald-600 dark:text-emerald-400" title="Verified">
                                <BadgeCheck className="h-4 w-4" />
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono block mt-0.5">ID: {p.page_id}</span>
                          {loadingSelectedId === p.page_id && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Opening the case file...
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(loadingAds || loadingSelectedId !== null) && selectedPage && (
                <div className="mt-6 w-full max-w-2xl text-left">
                  <div className="overflow-hidden rounded-[28px] border border-sky-200/70 bg-[radial-gradient(circle_at_top_left,rgba(186,230,253,0.4),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-6 shadow-[0_18px_55px_rgba(14,116,144,0.12)] dark:border-sky-900/40 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_35%),linear-gradient(180deg,rgba(10,14,23,0.96),rgba(10,14,23,0.92))]">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-14 w-14 shrink-0 border border-border/60 shadow-sm">
                        <AvatarImage
                          src={selectedPage.page_icon ?? getPageProfilePictureUrl(selectedPage.page_id) ?? undefined}
                          alt={selectedPage.page_name}
                        />
                        <AvatarFallback className="text-base font-semibold">
                          {selectedPage.page_name?.charAt(0) ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-foreground">
                            Searching: {selectedPage.page_name}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-foreground">
                          Searching the page... This may take a minute.
                        </p>
                        <p className="mt-1 text-sm text-amber-600 dark:text-amber-400 font-medium">
                          Please stay on this page.
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {SCRAPE_LOADING_LINES[loadingLineIndex]}
                        </p>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-sky-100/80 dark:bg-sky-950/30">
                          <div className="h-full w-1/3 animate-[pulse_1.8s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400" />
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />
                            {SCRAPE_LOADING_LINES[loadingLineIndex]}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {recentPages.length > 0 && (
                <div className="mt-6 w-full max-w-2xl text-left">
                  <p className="text-sm font-semibold text-foreground mb-4">Recent</p>
                  <div className="flex flex-wrap gap-6">
                    {recentPages.map((p) => (
                      <button
                        key={p.page_id}
                        type="button"
                        onClick={() => void handleLoadAds(p)}
                        disabled={loadingAds}
                        className="flex flex-col items-center gap-2 group disabled:opacity-50"
                      >
                        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-transparent group-hover:border-muted-foreground/30 transition-colors">
                          {(p.page_icon || getPageProfilePictureUrl(p.page_id)) ? (
                            <img
                              src={
                                getLogoDisplayUrl(p.page_icon ?? getPageProfilePictureUrl(p.page_id) ?? "") ??
                                p.page_icon ??
                                getPageProfilePictureUrl(p.page_id) ??
                                ""
                              }
                              alt=""
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-muted-foreground text-lg font-medium">
                              {p.page_name?.charAt(0) ?? "?"}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-foreground text-center max-w-[80px] truncate">
                          {p.page_name ?? "Name"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
