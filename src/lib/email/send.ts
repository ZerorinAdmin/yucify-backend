import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = process.env.EMAIL_FROM ?? "Repto <alerts@repto.app>";

type AlertEmailParams = {
  to: string;
  adName: string;
  newStatus: string;
  rulesTriggered: string[];
};

export async function sendAlertEmail({
  to,
  adName,
  newStatus,
  rulesTriggered,
}: AlertEmailParams) {
  const rulesHtml = rulesTriggered
    .map((r) => `<li>${r}</li>`)
    .join("");

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `⚠ Ad "${adName}" is now ${newStatus}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px;">
        <h2 style="color: ${newStatus === "FATIGUED" ? "#dc2626" : "#ca8a04"};">
          Ad status changed: ${newStatus}
        </h2>
        <p><strong>Ad:</strong> ${adName}</p>
        <p><strong>Triggered rules:</strong></p>
        <ul>${rulesHtml}</ul>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="color: #6b7280; font-size: 14px;">
          We recommend reviewing this ad manually. Consider refreshing creative,
          adjusting targeting, or pausing the ad if performance continues to decline.
        </p>
        <p style="color: #9ca3af; font-size: 12px;">
          Sent by Repto — your ad monitoring assistant.
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
