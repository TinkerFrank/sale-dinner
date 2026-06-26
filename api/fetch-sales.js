/** Instant sales response on Vercel — no Apify network calls. */
const { buildFakeSalesResponse } = require("../fake-sales");

let bundledCache = null;

function getCache() {
  if (bundledCache) return bundledCache;
  try {
    bundledCache = require("../sales_cache.json");
  } catch {
    bundledCache = null;
  }
  return bundledCache;
}

module.exports = (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const cache = getCache();
  if (cache?.saleItems?.length) {
    res.status(200).json({
      ...cache,
      source: "bundled-cache",
      cached: true,
    });
    return;
  }

  res.status(200).json(buildFakeSalesResponse());
};
