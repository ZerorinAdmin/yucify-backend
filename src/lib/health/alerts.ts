import { SupabaseClient } from "@supabase/supabase-js";
import { AdHealthResult } from "./engine";

type StatusTransition = {
  ad_id: string;
  ad_name: string;
  previous_status: string;
  new_status: string;
  rules_triggered: string[];
};

/**
 * Compare new health results against stored status, persist updates,
 * and enqueue email alerts for HEALTHY → DECLINING/FATIGUED transitions.
 * Returns the list of transitions that triggered alerts.
 */
export async function detectAndAlert(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  results: AdHealthResult[]
): Promise<StatusTransition[]> {
  const { data: existing } = await supabase
    .from("ad_health_status")
    .select("ad_id, status")
    .eq("user_id", userId);

  const statusMap = new Map<string, string>();
  for (const row of existing ?? []) {
    statusMap.set(row.ad_id, row.status);
  }

  const transitions: StatusTransition[] = [];

  for (const result of results) {
    const prev = statusMap.get(result.ad_id) ?? "HEALTHY";
    const triggeredLabels = result.rules
      .filter((r) => r.triggered)
      .map((r) => r.label);

    // Upsert the current status
    await supabase.from("ad_health_status").upsert(
      {
        user_id: userId,
        ad_id: result.ad_id,
        ad_name: result.ad_name,
        status: result.status,
        rules_triggered: triggeredLabels,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,ad_id" }
    );

    // Only alert on HEALTHY → DECLINING or HEALTHY → FATIGUED
    if (prev === "HEALTHY" && result.status !== "HEALTHY") {
      const transition: StatusTransition = {
        ad_id: result.ad_id,
        ad_name: result.ad_name,
        previous_status: prev,
        new_status: result.status,
        rules_triggered: triggeredLabels,
      };
      transitions.push(transition);

      await supabase.from("email_alert_queue").insert({
        user_id: userId,
        ad_id: result.ad_id,
        ad_name: result.ad_name,
        previous_status: prev,
        new_status: result.status,
        rules_triggered: triggeredLabels,
        recipient_email: userEmail,
      });
    }
  }

  return transitions;
}
