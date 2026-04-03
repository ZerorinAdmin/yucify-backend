import { createHash } from "crypto";

const META_VERSION = "v21.0";

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

type UserData = {
  email?: string;
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
};

type CAPIEvent = {
  eventName: string;
  eventId: string;
  eventTime?: number;
  eventSourceUrl?: string;
  userData: UserData;
  customData?: Record<string, unknown>;
};

export async function sendCAPIEvent(event: CAPIEvent): Promise<{ success: boolean; error?: string }> {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = process.env.META_APP_ID;
  if (!token || !pixelId) {
    console.warn("[meta-capi] META_CAPI_ACCESS_TOKEN or META_APP_ID not configured, skipping server event");
    return { success: false, error: "CAPI not configured" };
  }

  const userData: Record<string, string> = {};
  if (event.userData.email) userData.em = sha256(event.userData.email);
  if (event.userData.ip) userData.client_ip_address = event.userData.ip;
  if (event.userData.userAgent) userData.client_user_agent = event.userData.userAgent;
  if (event.userData.fbp) userData.fbp = event.userData.fbp;
  if (event.userData.fbc) userData.fbc = event.userData.fbc;

  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        action_source: "website",
        event_source_url: event.eventSourceUrl,
        user_data: userData,
        ...(event.customData ? { custom_data: event.customData } : {}),
      },
    ],
    ...(testCode ? { test_event_code: testCode } : {}),
  };

  const url = `https://graph.facebook.com/${META_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = (await res.json()) as { events_received?: number; error?: { message: string } };

    if (!res.ok) {
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      console.error("[meta-capi] Event send failed:", msg);
      return { success: false, error: msg };
    }

    console.log(`[meta-capi] ${event.eventName} sent (events_received: ${body.events_received ?? "?"})`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[meta-capi] Network error:", msg);
    return { success: false, error: msg };
  }
}
