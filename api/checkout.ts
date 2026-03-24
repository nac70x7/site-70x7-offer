import Stripe from "stripe";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID_997;
  const siteUrl = process.env.SITE_URL ?? "https://web.nac70x7.com";

  if (!stripeKey || !priceId) {
    return Response.json({ error: "Stripe not configured" }, { status: 500 });
  }

  try {
    const body = (await req.json()) as {
      business_name?: string;
      email?: string;
      preview_url?: string;
      niche?: string;
      city?: string;
    };

    if (!body.business_name || !body.email) {
      return Response.json(
        { error: "business_name and email are required" },
        { status: 400 },
      );
    }

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: body.email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        business_name: body.business_name,
        preview_url: body.preview_url ?? "",
        niche: body.niche ?? "",
        city: body.city ?? "",
        prospect_email: body.email,
      },
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#pricing`,
    });

    return Response.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
