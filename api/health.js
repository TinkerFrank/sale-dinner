/** Instant health check — no Express cold start. */
module.exports = (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).end(JSON.stringify({
    ok: true,
    elevenlabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    apifyConfigured: Boolean(process.env.APIFY_TOKEN),
    llmConfigured: false,
    staticSalesAvailable: true,
  }));
};
