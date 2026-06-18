import { authenticate } from "../shopify.server";
import { postToWeeber } from "../weeber.server";

/**
 * Webhook: customers/update
 *
 * Fired when a customer record is modified (e.g. email, phone, marketing
 * preferences). We push the updated contact data to Weeber.
 */
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[weeber] webhook ${topic} received for ${shop}`);

  if (topic !== "CUSTOMERS_UPDATE") {
    return new Response("Unsupported topic", { status: 400 });
  }

  try {
    await postToWeeber("/api/integrations/shopify/customers/update", {
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
      updated_at: payload.updated_at ?? null,
    });

    console.log(
      `[weeber] customers/update forwarded for ${shop} — customer ${payload.id}`
    );
  } catch (error) {
    console.error(
      `[weeber] customers/update failed to forward for ${shop}`,
      error
    );
  }

  return new Response("OK", { status: 200 });
};
