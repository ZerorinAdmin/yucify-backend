import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("ad_actions")
    .select("ad_id, action_type, action_count, action_value")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate: per ad_id, sum each action_type's count and value
  const adMap = new Map<string, Map<string, { count: number; value: number }>>();

  for (const row of rows ?? []) {
    let actionMap = adMap.get(row.ad_id);
    if (!actionMap) {
      actionMap = new Map();
      adMap.set(row.ad_id, actionMap);
    }
    const existing = actionMap.get(row.action_type) ?? { count: 0, value: 0 };
    existing.count += Number(row.action_count);
    existing.value += Number(row.action_value);
    actionMap.set(row.action_type, existing);
  }

  // Collect all action types across all ads
  const allTypes = new Set<string>();
  for (const actionMap of adMap.values()) {
    for (const type of actionMap.keys()) {
      allTypes.add(type);
    }
  }

  // Build response
  const result: Record<string, Record<string, { count: number; value: number }>> = {};
  for (const [adId, actionMap] of adMap) {
    result[adId] = {};
    for (const [type, data] of actionMap) {
      result[adId][type] = data;
    }
  }

  return NextResponse.json({
    actions: result,
    action_types: Array.from(allTypes).sort(),
  });
}
