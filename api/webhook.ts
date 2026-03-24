import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import * as crypto from "crypto";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    res.status(500).json({ error: "Stripe not configured" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf-8");
    const signature = req.headers["stripe-signature"] as string;

    const stripe = new Stripe(stripeKey);
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        id: string;
        amount_total: number | null;
        customer_email: string | null;
        metadata: Record<string, string>;
      };

      const amount = ((session.amount_total ?? 99700) / 100).toFixed(0);
      const name = session.metadata.business_name ?? "Unknown";
      const email =
        session.metadata.prospect_email ?? session.customer_email ?? "";
      const previewUrl = session.metadata.preview_url ?? "";
      const niche = session.metadata.niche ?? "";
      const city = session.metadata.city ?? "";

      const subject = `New 70x7 Sale — ${name} ($${amount})`;
      const body = [
        `New website sale received.`,
        ``,
        `Business: ${name}`,
        `Email: ${email}`,
        `Amount: $${amount}`,
        niche ? `Niche: ${niche}` : "",
        city ? `City: ${city}` : "",
        previewUrl ? `Preview: ${previewUrl}` : "",
        ``,
        `Stripe Session: ${session.id}`,
        ``,
        `Next steps:`,
        `1. Send onboarding email to ${email}`,
        `2. Request logo, photos, domain info`,
        `3. Process revision round when they reply`,
      ]
        .filter(Boolean)
        .join("\n");

      await sendNotificationEmail(subject, body);
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as {
        id: string;
        amount_refunded: number;
      };
      const amount = (charge.amount_refunded / 100).toFixed(0);
      await sendNotificationEmail(
        `70x7 Refund — $${amount}`,
        `Stripe refund processed.\n\nAmount: $${amount}\nCharge: ${charge.id}`,
      );
    }

    res.status(200).json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
}

// ─── Gmail via Service Account ──────────────────────────────────────────────

const NOTIFY_TO = "nicholas@nac70x7.com";
const NOTIFY_FROM = "nicholas@nac70x7.com";

async function sendNotificationEmail(
  subject: string,
  body: string,
): Promise<void> {
  try {
    const token = await getServiceAccountToken();
    if (!token) return;

    const mime = [
      `From: ${NOTIFY_FROM}`,
      `To: ${NOTIFY_TO}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
    ].join("\r\n");

    const encoded = Buffer.from(mime)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encoded }),
      },
    );

    if (!res.ok) {
      console.error(`Gmail send failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error(
      "Email notification failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function getServiceAccountToken(): Promise<string | null> {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!b64) return null;

  const sa = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    sub: NOTIFY_FROM,
    scope: "https://www.googleapis.com/auth/gmail.send",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const segments = [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(payload)),
  ];
  const signingInput = segments.join(".");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign
    .sign(sa.private_key, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) return null;
  const data = (await tokenRes.json()) as { access_token?: string };
  return data.access_token ?? null;
}

function base64url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
