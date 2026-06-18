import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  if (topic !== "APP_UNINSTALLED") {
    return new Response("Unsupported topic", { status: 400 });
  }

  try {
    await fetch("https://api.weeber.ai/api/integrations/shopify/uninstalled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop }),
    });
  } catch (error) {
    console.error("Failed to notify Weeber of Shopify uninstall", error);
  }

  return new Response("OK", { status: 200 });
};
