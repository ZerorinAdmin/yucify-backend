export type HealthStatus = "HEALTHY" | "DECLINING" | "FATIGUED";

export type HealthRule = {
  id: string;
  label: string;
  triggered: boolean;
};

export type AdHealthResult = {
  ad_id: string;
  ad_name: string;
  status: HealthStatus;
  rules: HealthRule[];
};

type DayMetric = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  frequency: number;
  roas: number;
};

// Thresholds configurable via ENV (fallback to requirements defaults)
function getThresholds() {
  return {
    ctrDropPct: parseFloat(process.env.HEALTH_CTR_DROP_PCT ?? "20"),
    ctrDropDays: parseInt(process.env.HEALTH_CTR_DROP_DAYS ?? "3"),
    cpcIncreasePct: parseFloat(process.env.HEALTH_CPC_INCREASE_PCT ?? "25"),
    frequencyMax: parseFloat(process.env.HEALTH_FREQUENCY_MAX ?? "3"),
    roasDeclineDays: parseInt(process.env.HEALTH_ROAS_DECLINE_DAYS ?? "3"),
  };
}

/**
 * Analyze health for a single ad given its last 7 days of metrics (sorted date asc).
 */
export function analyzeAdHealth(
  adId: string,
  adName: string,
  days: DayMetric[]
): AdHealthResult {
  const t = getThresholds();
  const rules: HealthRule[] = [];

  // Rule 1: CTR drops > X% over N days
  const ctrRule = checkCtrDrop(days, t.ctrDropPct, t.ctrDropDays);
  rules.push(ctrRule);

  // Rule 2: CPC increases > X%
  const cpcRule = checkCpcIncrease(days, t.cpcIncreasePct);
  rules.push(cpcRule);

  // Rule 3: Frequency > threshold
  const freqRule = checkFrequency(days, t.frequencyMax);
  rules.push(freqRule);

  // Rule 4: ROAS declining N consecutive days
  const roasRule = checkRoasDecline(days, t.roasDeclineDays);
  rules.push(roasRule);

  const triggeredCount = rules.filter((r) => r.triggered).length;
  let status: HealthStatus = "HEALTHY";
  if (triggeredCount >= 2) {
    status = "FATIGUED";
  } else if (triggeredCount === 1) {
    status = "DECLINING";
  }

  return { ad_id: adId, ad_name: adName, status, rules };
}

function checkCtrDrop(
  days: DayMetric[],
  dropPct: number,
  windowDays: number
): HealthRule {
  const label = `CTR dropped >${dropPct}% over ${windowDays} days`;
  if (days.length < windowDays) return { id: "ctr_drop", label, triggered: false };

  const recent = days.slice(-windowDays);
  const first = recent[0].ctr;
  const last = recent[recent.length - 1].ctr;
  if (first === 0) return { id: "ctr_drop", label, triggered: false };

  const changePct = ((first - last) / first) * 100;
  return { id: "ctr_drop", label, triggered: changePct > dropPct };
}

function checkCpcIncrease(days: DayMetric[], increasePct: number): HealthRule {
  const label = `CPC increased >${increasePct}%`;
  if (days.length < 2) return { id: "cpc_increase", label, triggered: false };

  const first = days[0].cpc;
  const last = days[days.length - 1].cpc;
  if (first === 0) return { id: "cpc_increase", label, triggered: false };

  const changePct = ((last - first) / first) * 100;
  return { id: "cpc_increase", label, triggered: changePct > increasePct };
}

function checkFrequency(days: DayMetric[], max: number): HealthRule {
  const label = `Frequency > ${max}`;
  if (days.length === 0) return { id: "frequency_high", label, triggered: false };

  const latest = days[days.length - 1].frequency;
  return { id: "frequency_high", label, triggered: latest > max };
}

function checkRoasDecline(days: DayMetric[], consecutiveDays: number): HealthRule {
  const label = `ROAS declining ${consecutiveDays} consecutive days`;
  if (days.length < consecutiveDays + 1) {
    return { id: "roas_decline", label, triggered: false };
  }

  let consecutive = 0;
  for (let i = 1; i < days.length; i++) {
    if (days[i].roas < days[i - 1].roas) {
      consecutive++;
      if (consecutive >= consecutiveDays) {
        return { id: "roas_decline", label, triggered: true };
      }
    } else {
      consecutive = 0;
    }
  }

  return { id: "roas_decline", label, triggered: false };
}

/**
 * Analyze health for all ads given raw metric rows.
 * Expects rows sorted by ad_id, date asc.
 */
export function analyzeAllAds(
  rows: (DayMetric & { ad_id: string; ad_name: string })[]
): AdHealthResult[] {
  const grouped = new Map<string, { name: string; days: DayMetric[] }>();

  for (const row of rows) {
    let entry = grouped.get(row.ad_id);
    if (!entry) {
      entry = { name: row.ad_name, days: [] };
      grouped.set(row.ad_id, entry);
    }
    entry.days.push({
      date: row.date,
      spend: Number(row.spend),
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      ctr: Number(row.ctr),
      cpc: Number(row.cpc),
      frequency: Number(row.frequency),
      roas: Number(row.roas),
    });
  }

  const results: AdHealthResult[] = [];
  for (const [adId, entry] of grouped) {
    entry.days.sort((a, b) => a.date.localeCompare(b.date));
    results.push(analyzeAdHealth(adId, entry.name, entry.days));
  }

  return results;
}
