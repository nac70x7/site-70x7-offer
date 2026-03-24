import type { VercelRequest, VercelResponse } from "@vercel/node";

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

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("payment_method_types[0]", "card");
    params.set("customer_email", email);
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("metadata[business_name]", business_name);
    params.set("metadata[preview_url]", preview_url || "");
    params.set("metadata[niche]", niche || "");
    params.set("metadata[city]", city || "");
    params.set("metadata[prospect_email]", email);
    params.set("success_url", `${siteUrl}/success.html`);
    params.set("cancel_url", `${siteUrl}/`);

    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const session = await response.json();

    if (!response.ok) {
      res.status(response.status).json({
        error: session.error?.message || "Stripe error",
      });
      return;
    }

    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
}
