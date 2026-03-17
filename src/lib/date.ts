/**
 * Validates YYYY-MM-DD date string and returns parsed range or null if invalid.
 * Security: rejects malformed input, enforces max range to prevent abuse.
 */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 365;

function isValidDateStr(s: string): boolean {
  if (!DATE_REGEX.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

export function parseAndValidateDateRange(
  from: string | null,
  to: string | null
): { from: string; to: string } | null {
  if (!from || !to || typeof from !== "string" || typeof to !== "string") {
    return null;
  }
  if (!isValidDateStr(from) || !isValidDateStr(to)) return null;

  const fromDate = new Date(from + "T00:00:00Z");
  const toDate = new Date(to + "T00:00:00Z");
  if (fromDate.getTime() > toDate.getTime()) return null;

  const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
  if (diffDays > MAX_RANGE_DAYS) return null;

  return { from, to };
}

export function getDefaultDateRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().split("T")[0],
    to: today.toISOString().split("T")[0],
  };
}
