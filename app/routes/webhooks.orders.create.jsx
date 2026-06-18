import { authenticate } from "../shopify.server";
import { postToWeeber } from "../weeber.server";

/**
 * Webhook: orders/create
 *
 * Fired when a merchant's customer completes a purchase. We notify Weeber so
 * it can cancel any pending abandoned-cart recovery call that was scheduled
 * for this checkout.
 */
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[weeber] webhook ${topic} received for ${shop}`);

  if (topic !== "ORDERS_CREATE") {
    return new Response("Unsupported topic", { status: 400 });
  }

  try {
    await postToWeeber("/api/integrations/shopify/orders/create", {
      shop,
      order_id: payload.id,
      order_number: payload.order_number,
      checkout_token: payload.checkout_token ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      total_price: payload.total_price ?? null,
      currency: payload.currency ?? null,
      financial_status: payload.financial_status ?? null,
      created_at: payload.created_at ?? null,
    });

    console.log(
      `[weeber] orders/create forwarded for ${shop} — order #${payload.order_number}`
    );
  } catch (error) {
    console.error(
      `[weeber] orders/create failed to forward for ${shop}`,
      error
    );
    // Return 200 so Shopify does not retry — we log the failure internally
  }

  return new Response("OK", { status: 200 });
};
