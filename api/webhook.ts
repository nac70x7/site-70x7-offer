import Stripe from "stripe";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return Response.json({ error: "Stripe not configured" }, { status: 500 });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    const stripe = new Stripe(stripeKey);
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        id: string;
        payment_intent: string | null;
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

    return Response.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 400 });
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
