import { authenticate } from "../shopify.server";
import { postToWeeber } from "../weeber.server";

/**
 * Webhook: customers/create
 *
 * Fired when a new customer account is created in the merchant's store.
 * We seed the contact record in Weeber so it can be used for outreach.
 */
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[weeber] webhook ${topic} received for ${shop}`);

  if (topic !== "CUSTOMERS_CREATE") {
    return new Response("Unsupported topic", { status: 400 });
  }

  try {
    await postToWeeber("/api/integrations/shopify/customers/create", {
      shop,
      customer_id: payload.id,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      first_name: payload.first_name ?? null,
      last_name: payload.last_name ?? null,
      orders_count: payload.orders_count ?? null,
      total_spent: payload.total_spent ?? null,
      currency: payload.currency ?? null,
      accepts_marketing: payload.accepts_marketing ?? null,
      created_at: payload.created_at ?? null,
    });

    console.log(
      `[weeber] customers/create forwarded for ${shop} — customer ${payload.id}`
    );
  } catch (error) {
    console.error(
      `[weeber] customers/create failed to forward for ${shop}`,
      error
    );
  }

  return new Response("OK", { status: 200 });
};
