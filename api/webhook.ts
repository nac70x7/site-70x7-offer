import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";

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

      await sendTelegramAlert(
        [
          `New 70x7 Sale!`,
          ``,
          `Business: ${name}`,
          `Email: ${email}`,
          `Amount: $${amount}`,
          niche ? `Niche: ${niche}` : "",
          city ? `City: ${city}` : "",
          previewUrl ? `Preview: ${previewUrl}` : "",
          ``,
          `Stripe Session: ${session.id}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as {
        id: string;
        amount_refunded: number;
      };
      const amount = (charge.amount_refunded / 100).toFixed(0);
      await sendTelegramAlert(
        `Stripe Refund: $${amount}\nCharge: ${charge.id}`,
      );
    }

    res.status(200).json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
}

async function sendTelegramAlert(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_ID;
  if (!botToken || !chatId) return;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  }).catch(() => {});
}
