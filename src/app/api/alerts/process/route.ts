import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendAlertEmail } from "@/lib/email/send";

/**
 * Process pending email alerts from the queue.
 * Can be triggered manually from dashboard or via a cron job.
 * Secured: either by user session or by a secret header for cron.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("x-cron-secret");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && authHeader !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch unsent alerts (limit batch to 20)
  const query = supabase
    .from("email_alert_queue")
    .select("*")
    .eq("sent", false)
    .order("created_at", { ascending: true })
    .limit(20);

  if (user) {
    query.eq("user_id", user.id);
  }

  const { data: pending, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const alert of pending) {
    try {
      await sendAlertEmail({
        to: alert.recipient_email,
        adName: alert.ad_name,
        newStatus: alert.new_status,
        rulesTriggered: alert.rules_triggered ?? [],
      });

      await supabase
        .from("email_alert_queue")
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq("id", alert.id);

      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`${alert.ad_name}: ${msg}`);
      console.error(`[alert-process] Failed to send alert ${alert.id}:`, msg);
    }
  }

  return NextResponse.json({ processed: sent, failed: errors.length, errors });
}
