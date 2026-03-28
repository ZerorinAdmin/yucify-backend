/**
 * Saved AI analyses (competitor reports + health diagnosis) stored in localStorage,
 * same pattern as adspy saved boards (SAVED_BOARDS_KEY).
 */

export const SAVED_ANALYSES_LOCAL_KEY = "adspy_saved_analyses";
export const SAVED_ANALYSES_CHANGE_EVENT = "adspy_saved_analyses_change";

export type SavedAnalysisStored = {
  id: string;
  page_id: string;
  page_name: string;
  analysis: unknown;
  ad_count: number | null;
  dominant_format: string | null;
  created_at: string;
  updated_at: string;
};

function parseList(): SavedAnalysisStored[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_ANALYSES_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedAnalysisStored[]) : [];
  } catch {
    return [];
  }
}

export function loadSavedAnalysesFromLocalStorage(): SavedAnalysisStored[] {
  return parseList();
}

export function getSavedAnalysesCountFromLocalStorage(): number {
  return loadSavedAnalysesFromLocalStorage().length;
}

export function persistSavedAnalysesToLocalStorage(items: SavedAnalysisStored[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_ANALYSES_LOCAL_KEY, JSON.stringify(items));
    window.dispatchEvent(
      new CustomEvent(SAVED_ANALYSES_CHANGE_EVENT, { detail: items.length })
    );
  } catch {
    // quota exceeded etc.
  }
}

export function upsertSavedAnalysisToLocalStorage(input: {
  page_id: string;
  page_name: string;
  analysis: unknown;
  ad_count?: number | null;
  dominant_format?: string | null;
}): SavedAnalysisStored {
  const list = parseList();
  const now = new Date().toISOString();
  const idx = list.findIndex((x) => x.page_id === input.page_id);
  if (idx >= 0) {
    const prev = list[idx]!;
    const next: SavedAnalysisStored = {
      ...prev,
      page_name: input.page_name,
      analysis: input.analysis,
      ad_count: input.ad_count ?? prev.ad_count,
      dominant_format: input.dominant_format ?? prev.dominant_format,
      updated_at: now,
    };
    list[idx] = next;
    persistSavedAnalysesToLocalStorage(list);
    return next;
  }
  const row: SavedAnalysisStored = {
    id: crypto.randomUUID(),
    page_id: input.page_id,
    page_name: input.page_name,
    analysis: input.analysis,
    ad_count: input.ad_count ?? null,
    dominant_format: input.dominant_format ?? null,
    created_at: now,
    updated_at: now,
  };
  persistSavedAnalysesToLocalStorage([row, ...list]);
  return row;
}

export function removeSavedAnalysisFromLocalStorageById(id: string): void {
  const list = parseList().filter((x) => x.id !== id);
  persistSavedAnalysesToLocalStorage(list);
}
