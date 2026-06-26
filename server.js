const fs = require("fs");
const path = require("path");
const envPath = fs.existsSync(path.join(__dirname, ".env"))
  ? path.join(__dirname, ".env")
  : path.join(__dirname, "dinner", ".env");
require("dotenv").config({ path: envPath });

const express = require("express");
const { suggestRecipes, getRecipeById } = require("./recipes");
const { buildFakeSalesResponse } = require("./fake-sales");
const { fetchLocalSales, loadBundledCache } = require("./apify-client");

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = Boolean(process.env.VERCEL);
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_DATASET_ID = process.env.APIFY_DATASET_ID;
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || "harvestedge~dutch-supermarkets-all-11";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const TTS_MODEL = "eleven_turbo_v2_5";

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    elevenlabsConfigured: Boolean(ELEVENLABS_API_KEY),
    apifyConfigured: Boolean(APIFY_TOKEN),
    llmConfigured: false,
    demoSalesAvailable: !APIFY_TOKEN,
    cachedSalesAvailable: Boolean(loadBundledCache()),
    isVercel: IS_VERCEL,
  });
});

app.post("/api/fetch-sales", async (req, res) => {
  const refresh = Boolean(req.body?.refresh);

  if (!APIFY_TOKEN) {
    return res.json(loadBundledCache() || buildFakeSalesResponse());
  }

  try {
    const result = await fetchLocalSales(APIFY_TOKEN, {
      datasetId: APIFY_DATASET_ID || undefined,
      actorId: APIFY_ACTOR_ID,
      refresh: refresh || !IS_VERCEL,
    });
    res.json(result);
  } catch (error) {
    console.error("Fetch sales error:", error.message);
    res.json(loadBundledCache() || buildFakeSalesResponse());
  }
});

app.post("/api/suggest", (req, res) => {
  const { saleItems, limit } = req.body || {};
  const result = suggestRecipes(saleItems || "", limit || 3);
  res.json(result);
});

app.get("/api/recipes/:id", (req, res) => {
  const recipe = getRecipeById(req.params.id);
  if (!recipe) {
    return res.status(404).json({ error: "Recipe not found" });
  }
  res.json(recipe);
});

app.post("/api/speak", async (req, res) => {
  const { text, voiceId } = req.body || {};

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Text is required" });
  }

  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: "ElevenLabs API key is not configured" });
  }

  const selectedVoice = voiceId || DEFAULT_VOICE_ID;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: TTS_MODEL,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs error:", response.status, errorText);
      return res.status(response.status).json({
        error: "ElevenLabs request failed",
        details: errorText,
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "Cache-Control": "private, max-age=3600",
    });
    res.send(audioBuffer);
  } catch (error) {
    console.error("TTS error:", error);
    res.status(500).json({ error: "Failed to generate speech" });
  }
});

app.get("/api/voices", async (_req, res) => {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: "ElevenLabs API key is not configured" });
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    const voices = (data.voices || []).map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      category: voice.category,
    }));

    res.json({ voices });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

if (!IS_VERCEL) {
  app.use(express.static(path.join(__dirname, "public")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });
}

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sale Dinner Suggest running at http://localhost:${PORT}`);
    if (!ELEVENLABS_API_KEY) {
      console.warn("Warning: ELEVENLABS_API_KEY is not set. Audio will not work.");
    }
    if (!APIFY_TOKEN) {
      console.warn("Warning: APIFY_TOKEN is not set. Demo sales will be used.");
    }
  });
}
