/**
 * Weeber backend integration utilities.
 * Handles merchant enrichment, payload construction, and resilient POSTs to api.weeber.ai.
 */

const WEEBER_API_BASE = "https://api.weeber.ai";
const SHOPIFY_API_VERSION = "2025-01";

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/**
 * Returns an ISO-8601 timestamp for exactly 30 days ago.
 */
export function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Shopify REST helpers
// ---------------------------------------------------------------------------

/**
 * Perform a GET request against the Shopify Admin REST API.
 * Uses the merchant's offline access token directly so this works both inside
 * and outside of a request context (e.g. afterAuth hooks).
 *
 * @param {string} shop   - myshopify domain, e.g. "example.myshopify.com"
 * @param {string} token  - offline access token
 * @param {string} path   - REST path, e.g. "/admin/api/2025-01/shop.json"
 * @returns {Promise<object>} parsed JSON body
 */
async function shopifyGet(shop, token, path) {
  const url = `https://${shop}${path}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Shopify REST ${path} returned ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Merchant enrichment
// ---------------------------------------------------------------------------

/**
 * Fetch merchant metadata and store metrics in parallel.
 * Returns a best-effort enrichment object — individual failures are caught and
 * replaced with null so they never block the OAuth flow.
 *
 * @param {string} shop   - myshopify domain
 * @param {string} token  - offline access token
 * @returns {Promise<object>} enrichment fields
 */
export async function fetchMerchantEnrichment(shop, token) {
  const base = `/admin/api/${SHOPIFY_API_VERSION}`;
  const ordersMin = thirtyDaysAgo();

  const [shopData, productsCount, ordersCount, checkoutsCount, customersCount] =
    await Promise.allSettled([
      shopifyGet(shop, token, `${base}/shop.json`),
      shopifyGet(shop, token, `${base}/products/count.json`),
      shopifyGet(
        shop,
        token,
        `${base}/orders/count.json?status=any&created_at_min=${encodeURIComponent(ordersMin)}`
      ),
      shopifyGet(shop, token, `${base}/checkouts/count.json`),
      shopifyGet(shop, token, `${base}/customers/count.json`),
    ]);

  // Extract values, falling back to null on failure
  const shopInfo =
    shopData.status === "fulfilled" ? shopData.value?.shop ?? null : null;
  const productCount =
    productsCount.status === "fulfilled"
      ? productsCount.value?.count ?? null
      : null;
  const orderCount30d =
    ordersCount.status === "fulfilled"
      ? ordersCount.value?.count ?? null
      : null;
  const checkoutCount =
    checkoutsCount.status === "fulfilled"
      ? checkoutsCount.value?.count ?? null
      : null;
  const customerCount =
    customersCount.status === "fulfilled"
      ? customersCount.value?.count ?? null
      : null;

  // Log any individual failures for debugging without surfacing them
  if (shopData.status === "rejected") {
    console.error("[weeber] enrichment: shop.json failed", shopData.reason);
  }
  if (productsCount.status === "rejected") {
    console.error(
      "[weeber] enrichment: products/count failed",
      productsCount.reason
    );
  }
  if (ordersCount.status === "rejected") {
    console.error(
      "[weeber] enrichment: orders/count failed",
      ordersCount.reason
    );
  }
  if (checkoutsCount.status === "rejected") {
    console.error(
      "[weeber] enrichment: checkouts/count failed",
      checkoutsCount.reason
    );
  }
  if (customersCount.status === "rejected") {
    console.error(
      "[weeber] enrichment: customers/count failed",
      customersCount.reason
    );
  }

  return {
    // Plan / store identity
    plan_name: shopInfo?.plan_name ?? null,
    plan_display_name: shopInfo?.plan_display_name ?? null,
    currency: shopInfo?.currency ?? null,
    country_code: shopInfo?.country_code ?? null,
    timezone: shopInfo?.iana_timezone ?? null,
    contact_email: shopInfo?.email ?? null,
    shop_name: shopInfo?.name ?? null,
    shop_domain: shopInfo?.domain ?? null,
    created_at: shopInfo?.created_at ?? null,

    // Store metrics
    product_count: productCount,
    order_count_30d: orderCount30d,
    checkout_count: checkoutCount,
    customer_count: customerCount,
  };
}

/**
 * Build the full payload sent to Weeber on OAuth completion.
 *
 * @param {object} session   - Shopify session (shop, accessToken, scope)
 * @param {object} enrichment - result of fetchMerchantEnrichment()
 * @param {string|null} orgId - optional org_id from OAuth query params
 * @returns {object}
 */
export function buildConnectedPayload(session, enrichment, orgId) {
  return {
    shop: session.shop,
    access_token: session.accessToken,
    scopes: session.scope,
    org_id: orgId ?? null,
    ...enrichment,
  };
}

// ---------------------------------------------------------------------------
// Weeber API client
// ---------------------------------------------------------------------------

/**
 * POST data to a Weeber backend endpoint with basic retry logic.
 * Retries up to `maxRetries` times on network errors or 5xx responses,
 * with exponential back-off starting at `baseDelayMs`.
 *
 * @param {string} path        - e.g. "/api/integrations/shopify/connected"
 * @param {object} body        - JSON-serialisable payload
 * @param {object} [opts]
 * @param {number} [opts.maxRetries=2]
 * @param {number} [opts.baseDelayMs=500]
 * @returns {Promise<Response>}
 */
export async function postToWeeber(path, body, { maxRetries = 2, baseDelayMs = 500 } = {}) {
  const url = `${WEEBER_API_BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "X-Weeber-Secret": process.env.WEEBER_INTERNAL_SECRET ?? "",
  };

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
      console.log(`[weeber] retry ${attempt}/${maxRetries} → POST ${path}`);
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return res;
      }

      // Retry on server errors; surface client errors immediately
      if (res.status < 500) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Weeber POST ${path} returned ${res.status}: ${text}`
        );
      }

      lastError = new Error(`Weeber POST ${path} returned ${res.status}`);
      console.warn(`[weeber] attempt ${attempt + 1} failed (${res.status})`);
    } catch (err) {
      if (err.message.includes("returned 4")) throw err; // don't retry 4xx
      lastError = err;
      console.warn(`[weeber] attempt ${attempt + 1} network error:`, err.message);
    }
  }

  throw lastError;
}
