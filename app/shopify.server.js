import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

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
      
      try {
        await fetch("https://api.weeber.ai/api/integrations/shopify/connected", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-Weeber-Secret": process.env.WEEBER_INTERNAL_SECRET
          },
          body: JSON.stringify({
            shop: session.shop,
            access_token: session.accessToken,
            scopes: session.scope,
            org_id: request ? new URL(request.url).searchParams.get("org_id") : null
          }),
        });
      } catch (error) {
        console.error("Failed to notify Weeber of Shopify connection", error);
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
