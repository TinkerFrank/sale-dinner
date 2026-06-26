/** Fetch grocery sales via Apify (Node — used on Vercel). */

const fs = require("fs");
const path = require("path");

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "harvestedge~dutch-supermarkets-all-11";
const VERCEL_FETCH_TIMEOUT_MS = 8000;
const CACHE_FILE = path.join(__dirname, "sales_cache.json");

const DUTCH_TO_INGREDIENT = [
  [/\bzalm\b/, "salmon"],
  [/\bkip\b/, "chicken"],
  [/\bvarkens\b|\bbeenham\b|\bham\b/, "pork"],
  [/\brund\b|\bgehakt\b|\bbief\b/, "beef"],
  [/\bgarnalen\b|\bscampi\b/, "shrimp"],
  [/\bbroccoli\b/, "broccoli"],
  [/\btomaat/, "tomatoes"],
  [/\bpaprika\b/, "bell pepper"],
  [/\bappel/, "apples"],
  [/\bui\b|\buien\b/, "onion"],
  [/\bknoflook\b/, "garlic"],
  [/\bpasta\b|\bspaghetti\b|\bpenne\b/, "pasta"],
  [/\brijst\b/, "rice"],
  [/\bkaas\b|\bkwark\b/, "cheese"],
  [/\broom\b|\bslagroom\b/, "cream"],
  [/\bspinazie\b|\bsla\b/, "spinach"],
  [/\basperge/, "asparagus"],
  [/\bwortel/, "carrots"],
  [/\bchampignon/, "mushrooms"],
  [/\bcitroen\b/, "lemon"],
  [/\btortilla\b|\bwrap\b/, "tortillas"],
];

function extractItemName(record) {
  if (!record || typeof record !== "object") return null;
  for (const key of ["name", "title", "itemName", "productName", "item"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function dutchNameToIngredients(name) {
  const lowered = name.toLowerCase();
  const found = [];
  for (const [pattern, ingredient] of DUTCH_TO_INGREDIENT) {
    if (pattern.test(lowered)) found.push(ingredient);
  }
  return found.length ? [...new Set(found)] : [name];
}

function hasDiscount(record) {
  const discount = record?.discount;
  if (discount == null) return false;
  if (typeof discount === "string") return Boolean(discount.trim());
  return Boolean(discount);
}

async function apifyRequest(url, { method = "GET", body, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Apify error (${response.status}): ${text.slice(0, 200)}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

function loadBundledCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (!data?.saleItems?.length) return null;
    return {
      ...data,
      source: "bundled-cache",
      cached: true,
    };
  } catch {
    return null;
  }
}

async function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Apify fetch timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

async function getLatestSuccessfulRun(token, actorId = ACTOR_ID) {
  const url = `${APIFY_BASE}/acts/${actorId}/runs?token=${token}&status=SUCCEEDED&limit=1&desc=1`;
  const data = await apifyRequest(url);
  const items = data?.data?.items || [];
  return items[0] || null;
}

async function fetchDatasetSales(token, datasetId, { onSaleOnly = false, supermarketFilter = null, limit = 500, timeoutMs = 15000 } = {}) {
  const url = `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&limit=${limit}`;
  const data = await apifyRequest(url, { timeoutMs });
  if (!Array.isArray(data)) {
    throw new Error("Unexpected Apify dataset response");
  }

  const deals = [];
  const saleItems = [];
  const seenIngredients = new Set();
  const seenNames = new Set();
  let supermarket = null;

  for (const record of data) {
    if (onSaleOnly && !hasDiscount(record)) continue;

    const store = record.supermarket || record.merchant || record.store;
    if (supermarketFilter) {
      const storeText = `${store || ""} ${record.url || ""}`.toLowerCase();
      if (!storeText.includes(supermarketFilter.toLowerCase())) continue;
    }

    const name = extractItemName(record);
    if (!name) continue;

    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);

    if (store && !supermarket) supermarket = store;

    const ingredients = dutchNameToIngredients(name);
    for (const ingredient of ingredients) {
      const key = ingredient.toLowerCase();
      if (!seenIngredients.has(key)) {
        seenIngredients.add(key);
        saleItems.push(ingredient);
      }
    }

    const discount = record.discount;
    let savingsText = null;
    if (hasDiscount(record)) {
      savingsText = typeof discount === "number"
        ? `Was €${discount.toFixed(2).replace(".", ",")}`
        : `Was ${discount}`;
    }

    deals.push({
      name,
      ingredients,
      supermarket: store,
      price: record.price_eur ?? record.price ?? record.salePrice,
      discount,
      url: record.url,
      unitSize: record.unit_size,
      savingsText,
      promotionTag: savingsText,
    });
  }

  if (!saleItems.length) {
    throw new Error("No sale items found in the Apify dataset");
  }

  return {
    source: "apify-dataset",
    datasetId,
    supermarket,
    saleItems,
    deals,
    count: deals.length,
    ingredientCount: saleItems.length,
  };
}

async function fetchFromApify(token, { datasetId, actorId = ACTOR_ID } = {}) {
  const timeoutMs = process.env.VERCEL ? VERCEL_FETCH_TIMEOUT_MS : 60000;
  const itemLimit = process.env.VERCEL ? 120 : 500;

  if (datasetId) {
    const result = await fetchDatasetSales(token, datasetId, { limit: itemLimit, timeoutMs });
    result.source = "apify-dataset";
    return result;
  }

  const latestRun = await apifyRequest(
    `${APIFY_BASE}/acts/${actorId}/runs?token=${token}&status=SUCCEEDED&limit=1&desc=1`,
    { timeoutMs: Math.min(timeoutMs, 5000) }
  );
  const run = latestRun?.data?.items?.[0];
  if (!run?.defaultDatasetId) {
    throw new Error("No recent Apify run found");
  }

  const result = await fetchDatasetSales(token, run.defaultDatasetId, {
    onSaleOnly: true,
    supermarketFilter: "jumbo",
    limit: itemLimit,
    timeoutMs,
  });
  result.source = "apify-actor-run";
  result.actorId = actorId;
  result.runId = run.id;
  result.datasetId = run.defaultDatasetId;
  return result;
}

async function fetchLocalSales(token, { datasetId, actorId = ACTOR_ID, refresh = false } = {}) {
  if (!token) throw new Error("Apify token is not configured");

  // Vercel functions time out quickly — serve bundled cache unless user explicitly refreshes.
  if (process.env.VERCEL && !refresh) {
    const cached = loadBundledCache();
    if (cached) return cached;
  }

  try {
    const fetchPromise = fetchFromApify(token, { datasetId, actorId });
    const timeoutMs = process.env.VERCEL ? VERCEL_FETCH_TIMEOUT_MS : 60000;
    return await withTimeout(fetchPromise, timeoutMs);
  } catch (error) {
    const cached = loadBundledCache();
    if (cached) {
      cached.fallbackReason = error.message;
      return cached;
    }
    throw error;
  }
}

module.exports = {
  ACTOR_ID,
  fetchLocalSales,
  loadBundledCache,
  getLatestSuccessfulRun,
};
