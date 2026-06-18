import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import {
  fetchMerchantEnrichment,
  buildConnectedPayload,
  postToWeeber,
} from "./weeber.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  isEmbeddedApp: false,
  hooks: {
    afterAuth: async ({ session, request }) => {
      shopify.registerWebhooks({ session });

      const orgId = request
        ? new URL(request.url).searchParams.get("org_id")
        : null;

      try {
        console.log(`[weeber] afterAuth: enriching merchant data for ${session.shop}`);

        const enrichment = await fetchMerchantEnrichment(
          session.shop,
          session.accessToken
        );

        console.log(`[weeber] afterAuth: enrichment complete for ${session.shop}`, {
          plan: enrichment.plan_name,
          products: enrichment.product_count,
          orders_30d: enrichment.order_count_30d,
          customers: enrichment.customer_count,
        });

        const payload = buildConnectedPayload(session, enrichment, orgId);

        await postToWeeber("/api/integrations/shopify/connected", payload);

        console.log(`[weeber] afterAuth: successfully notified Weeber for ${session.shop}`);
      } catch (error) {
        // Never block OAuth completion on enrichment/notification failures
        console.error(
          `[weeber] afterAuth: failed to notify Weeber for ${session.shop}`,
          error
        );
      }
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
