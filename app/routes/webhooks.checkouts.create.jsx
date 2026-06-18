import { authenticate } from "../shopify.server";
import { postToWeeber } from "../weeber.server";

/**
 * Webhook: checkouts/create
 *
 * Fired when a customer starts a checkout. We notify Weeber to schedule an
 * abandoned-cart recovery call 30 minutes from now if the checkout is not
 * completed.
 */
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[weeber] webhook ${topic} received for ${shop}`);

  if (topic !== "CHECKOUTS_CREATE") {
    return new Response("Unsupported topic", { status: 400 });
  }

  try {
    await postToWeeber("/api/integrations/shopify/checkouts/create", {
      shop,
      checkout_token: payload.token ?? null,
      cart_token: payload.cart_token ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      total_price: payload.total_price ?? null,
      currency: payload.currency ?? null,
      line_items_count: Array.isArray(payload.line_items)
        ? payload.line_items.length
        : null,
      created_at: payload.created_at ?? null,
      updated_at: payload.updated_at ?? null,
    });

    console.log(
      `[weeber] checkouts/create forwarded for ${shop} — token ${payload.token}`
    );
  } catch (error) {
    console.error(
      `[weeber] checkouts/create failed to forward for ${shop}`,
      error
    );
  }

  return new Response("OK", { status: 200 });
};
