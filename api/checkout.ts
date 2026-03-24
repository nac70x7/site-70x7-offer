import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID_997;
  const siteUrl = process.env.SITE_URL || "https://web.nac70x7.com";

  if (!stripeKey || !priceId) {
    res.status(500).json({ error: "Stripe not configured" });
    return;
  }

  try {
    const { business_name, email, preview_url, niche, city } = req.body;

    if (!business_name || !email) {
      res.status(400).json({ error: "business_name and email are required" });
      return;
    }

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        business_name,
        preview_url: preview_url || "",
        niche: niche || "",
        city: city || "",
        prospect_email: email,
      },
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#pricing`,
    });

    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
}
