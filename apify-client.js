/** Fetch grocery sales via Apify (Node — used on Vercel). */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "harvestedge~dutch-supermarkets-all-11";

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

async function apifyRequest(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Apify error (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function getLatestSuccessfulRun(token, actorId = ACTOR_ID) {
  const url = `${APIFY_BASE}/acts/${actorId}/runs?token=${token}&status=SUCCEEDED&limit=1&desc=1`;
  const data = await apifyRequest(url);
  const items = data?.data?.items || [];
  return items[0] || null;
}

async function fetchDatasetSales(token, datasetId, { onSaleOnly = false, supermarketFilter = null, limit = 500 } = {}) {
  const url = `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&limit=${limit}`;
  const data = await apifyRequest(url);
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

async function fetchLocalSales(token, { datasetId, actorId = ACTOR_ID, startNewRun = false } = {}) {
  if (!token) throw new Error("Apify token is not configured");

  if (datasetId) {
    const result = await fetchDatasetSales(token, datasetId);
    result.source = "apify-dataset";
    return result;
  }

  // On Vercel, avoid long-running actor polls — use latest successful run only.
  if (startNewRun && !process.env.VERCEL) {
    throw new Error("Starting a new actor run is only supported on the local Python server");
  }

  const latestRun = await getLatestSuccessfulRun(token, actorId);
  if (latestRun?.defaultDatasetId) {
    const result = await fetchDatasetSales(token, latestRun.defaultDatasetId, {
      onSaleOnly: true,
      supermarketFilter: "jumbo",
    });
    result.source = "apify-actor-run";
    result.actorId = actorId;
    result.runId = latestRun.id;
    result.datasetId = latestRun.defaultDatasetId;
    if (result.saleItems?.length) return result;
  }

  throw new Error("No recent Apify run with Jumbo sale items found");
}

module.exports = {
  ACTOR_ID,
  fetchLocalSales,
  getLatestSuccessfulRun,
};
