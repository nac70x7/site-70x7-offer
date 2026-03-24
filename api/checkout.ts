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

    const fields: Record<string, string> = {
      mode: "payment",
      "payment_method_types[0]": "card",
      customer_email: email,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "metadata[business_name]": business_name,
      "metadata[preview_url]": preview_url || "",
      "metadata[niche]": niche || "",
      "metadata[city]": city || "",
      "metadata[prospect_email]": email,
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#pricing`,
    };

    const encode = (v: string) =>
      encodeURIComponent(v).replace(
        /%7BCHECKOUT_SESSION_ID%7D/gi,
        "{CHECKOUT_SESSION_ID}",
      );
    const body = Object.entries(fields)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encode(v)}`)
      .join("&");

    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    const session = await response.json();

    if (!response.ok) {
      res.status(response.status).json({
        error: session.error?.message || "Stripe error",
        type: session.error?.type,
        param: session.error?.param,
        code: session.error?.code,
      });
      return;
    }

    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
}
