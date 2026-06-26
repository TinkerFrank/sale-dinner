const saleInput = document.getElementById("sale-items");
const fetchSalesBtn = document.getElementById("fetch-sales-btn");
const storedSalesBtn = document.getElementById("stored-sales-btn");
const fetchStatus = document.getElementById("fetch-status");
const savingsPanel = document.getElementById("savings-panel");
const savingsList = document.getElementById("savings-list");
const suggestBtn = document.getElementById("suggest-btn");
const resultsPanel = document.getElementById("results-panel");
const resultsSummary = document.getElementById("results-summary");
const recipeCards = document.getElementById("recipe-cards");
const recipeDetail = document.getElementById("recipe-detail");
const backBtn = document.getElementById("back-btn");
const detailName = document.getElementById("detail-name");
const detailDesc = document.getElementById("detail-desc");
const detailTime = document.getElementById("detail-time");
const detailServings = document.getElementById("detail-servings");
const detailSaleItems = document.getElementById("detail-sale-items");
const detailPantry = document.getElementById("detail-pantry");
const recipeSavingsBox = document.getElementById("recipe-savings-box");
const detailTotalSavings = document.getElementById("detail-total-savings");
const detailDealSavings = document.getElementById("detail-deal-savings");
const detailSavingsNote = document.getElementById("detail-savings-note");
const stepsList = document.getElementById("steps-list");
const voiceSelect = document.getElementById("voice-select");
const playAllBtn = document.getElementById("play-all-btn");
const stopBtn = document.getElementById("stop-btn");
const toast = document.getElementById("toast");
const layout = document.querySelector(".layout");

let currentRecipe = null;
let loadedDeals = [];
let recipeSuggestions = new Map();
let audioCache = new Map();
let currentAudio = null;
let playAllAbort = false;

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => { toast.hidden = true; }, 250);
  }, 3200);
}

function stopAudio() {
  playAllAbort = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  document.querySelectorAll(".step-item.playing").forEach((el) => {
    el.classList.remove("playing");
  });
  stopBtn.hidden = true;
  playAllBtn.disabled = false;
}

function playAudioBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      reject(new Error("Audio playback failed"));
    };

    audio.play().catch(reject);
  });
}

async function fetchSpeech(text) {
  const cacheKey = `${voiceSelect.value}::${text}`;
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey);
  }

  const response = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId: voiceSelect.value })
  });

  if (!response.ok) {
    let message = "Could not generate audio";
    try {
      const data = await response.json();
      message = data.error || data.details || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  audioCache.set(cacheKey, blob);
  return blob;
}

async function speakStep(stepIndex, stepText) {
  const stepEl = stepsList.children[stepIndex];
  const playBtn = stepEl.querySelector(".step-play");

  stepEl.classList.add("playing");
  playBtn.disabled = true;
  playBtn.textContent = "…";

  try {
    const intro = `Step ${stepIndex + 1}. ${stepText}`;
    const blob = await fetchSpeech(intro);
    if (playAllAbort) return;
    await playAudioBlob(blob);
    stepEl.classList.remove("playing");
    stepEl.classList.add("done");
  } catch (error) {
    stepEl.classList.remove("playing");
    showToast(error.message);
    throw error;
  } finally {
    playBtn.disabled = false;
    playBtn.textContent = "▶ Listen";
  }
}

async function playAllSteps() {
  if (!currentRecipe) return;

  playAllAbort = false;
  playAllBtn.disabled = true;
  stopBtn.hidden = false;

  document.querySelectorAll(".step-item.done").forEach((el) => el.classList.remove("done"));

  for (let i = 0; i < currentRecipe.steps.length; i++) {
    if (playAllAbort) break;
    await speakStep(i, currentRecipe.steps[i]);
  }

  stopBtn.hidden = true;
  playAllBtn.disabled = false;

  if (!playAllAbort) {
    showToast("All steps complete — enjoy your dinner!");
  }
}

function formatEuro(amount) {
  return `€${amount.toFixed(2).replace(".", ",")}`;
}

function savingsBadge(recipe) {
  if (recipe.totalSavingsEur != null && recipe.totalSavingsEur > 0) {
    const prefix = recipe.estimatedSavings ? "Est. " : "";
    return `<span class="badge badge-savings">${prefix}${formatEuro(recipe.totalSavingsEur)} savings</span>`;
  }
  if (recipe.dealCount > 0) {
    return `<span class="badge badge-savings">${recipe.dealCount} deal${recipe.dealCount === 1 ? "" : "s"} on sale</span>`;
  }
  return "";
}

function renderRecipeSavings(recipe) {
  const deals = recipe.matchedDeals || [];
  if (!deals.length) {
    recipeSavingsBox.hidden = true;
    detailDealSavings.innerHTML = "";
    detailSavingsNote.hidden = true;
    return;
  }

  recipeSavingsBox.hidden = false;
  detailSavingsNote.hidden = !recipe.estimatedSavings;

  if (recipe.totalSavingsEur != null && recipe.totalSavingsEur > 0) {
    const prefix = recipe.estimatedSavings ? "Est. " : "";
    detailTotalSavings.textContent = `${prefix}${formatEuro(recipe.totalSavingsEur)}`;
  } else {
    detailTotalSavings.textContent = `${deals.length} item${deals.length === 1 ? "" : "s"} on sale`;
  }

  detailDealSavings.innerHTML = deals.map((deal) => {
    const prefix = deal.estimated ? "~" : "";
    const amount = deal.savingsEur != null
      ? `${prefix}${formatEuro(deal.savingsEur)}`
      : escapeHtml(deal.savingsText || "On sale");
    const url = deal.url ? escapeHtml(deal.url) : "#";
    return `
      <li class="deal-savings-item">
        <span class="deal-savings-name">${escapeHtml(deal.name || "Sale item")}</span>
        <span class="deal-savings-amount">${amount}</span>
        ${deal.url ? `<a class="savings-link" href="${url}" target="_blank" rel="noopener noreferrer">View →</a>` : ""}
      </li>`;
  }).join("");
}

function renderRecipeCards(suggestions, saleItems) {
  recipeSuggestions = new Map(suggestions.map((r) => [r.id, r]));

  if (suggestions.length === 0) {
    recipeCards.innerHTML = `
      <div class="empty-state">
        <p>No strong matches found. Try adding more proteins or vegetables from the flyer.</p>
      </div>`;
    resultsSummary.textContent = `Searched ${saleItems.length} sale item${saleItems.length === 1 ? "" : "s"}.`;
    return;
  }

  resultsSummary.textContent = `Found ${suggestions.length} custom recipe${suggestions.length === 1 ? "" : "s"} from ${saleItems.length} sale item${saleItems.length === 1 ? "" : "s"}.`;

  recipeCards.innerHTML = suggestions.map((recipe) => {
    const saleTags = (recipe.saleIngredients || recipe.matchedIngredients || []).slice(0, 4);
    const pantryCount = (recipe.pantryIngredients || []).length;

    return `
    <article class="recipe-card" data-id="${recipe.id}" tabindex="0" role="button" aria-label="View ${recipe.name}">
      <h3>${escapeHtml(recipe.name)}</h3>
      <p>${escapeHtml(recipe.description)}</p>
      <div class="card-meta">
        <span class="badge badge-match">${saleTags.length} sale item${saleTags.length === 1 ? "" : "s"}</span>
        ${recipe.tags?.includes("ai") ? '<span class="badge badge-ai">AI recipe</span>' : ""}
        ${savingsBadge(recipe)}
        <span class="badge badge-time">${recipe.time}</span>
      </div>
      <ul class="tag-list tag-sale">
        ${saleTags.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
      ${pantryCount ? `<p class="card-pantry-note">+ ${pantryCount} pantry staple${pantryCount === 1 ? "" : "s"}</p>` : ""}
    </article>`;
  }).join("");

  recipeCards.querySelectorAll(".recipe-card").forEach((card) => {
    const open = () => openRecipe(card.dataset.id);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function openRecipe(id) {
  const recipe = recipeSuggestions.get(id);
  if (!recipe) {
    showToast("Could not load recipe");
    return;
  }

  currentRecipe = recipe;
  stopAudio();
  audioCache.clear();

  detailName.textContent = recipe.name;
  detailDesc.textContent = recipe.description;
  detailTime.textContent = `⏱ ${recipe.time}`;
  detailServings.textContent = `🍽 Serves ${recipe.servings}`;

  detailSaleItems.innerHTML = (recipe.saleIngredients || recipe.matchedIngredients || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  detailPantry.innerHTML = (recipe.pantryIngredients || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  renderRecipeSavings(recipe);

  stepsList.innerHTML = recipe.steps.map((step, index) => `
    <li class="step-item" data-step="${index}">
      <span class="step-num">${index + 1}</span>
      <p class="step-text">${escapeHtml(step)}</p>
      <button type="button" class="step-play" data-step="${index}" aria-label="Listen to step ${index + 1}">▶ Listen</button>
    </li>
  `).join("");

  stepsList.querySelectorAll(".step-play").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      stopAudio();
      playAllAbort = false;
      const idx = Number(btn.dataset.step);
      await speakStep(idx, recipe.steps[idx]);
    });
  });

  resultsPanel.hidden = true;
  recipeDetail.hidden = false;
  recipeDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadVoices() {
  try {
    const response = await fetch("/api/voices");
    if (!response.ok) return;

    const data = await response.json();
    if (!data.voices?.length) return;

    voiceSelect.innerHTML = data.voices
      .slice(0, 12)
      .map((voice) => `<option value="${voice.id}">${voice.name}</option>`)
      .join("");
  } catch {
    /* keep default voice */
  }
}

suggestBtn.addEventListener("click", async () => {
  const saleItems = saleInput.value.trim();
  if (!saleItems) {
    showToast("Add at least one sale item");
    saleInput.focus();
    return;
  }

  suggestBtn.disabled = true;
  suggestBtn.textContent = "Finding ideas…";

  try {
    const response = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saleItems, limit: 3, deals: loadedDeals })
    });

    const data = await response.json();
    renderRecipeCards(data.suggestions, data.saleItems);

    resultsPanel.hidden = false;
    layout.classList.add("has-results");
    recipeDetail.hidden = true;
    resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch {
    showToast("Something went wrong. Is the server running?");
  } finally {
    suggestBtn.disabled = false;
    suggestBtn.innerHTML = '<span class="btn-icon">✦</span> Find dinner ideas';
  }
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    saleInput.value = chip.dataset.sample.replace(/,\s*/g, "\n");
    saleInput.focus();
  });
});

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const isHtml = /^\s*</.test(text);
    throw new Error(
      isHtml
        ? "Server returned HTML instead of JSON — restart with: py server.py"
        : "Invalid response from server"
    );
  }
}

function renderSavingsList(deals) {
  if (!deals?.length) {
    savingsPanel.hidden = true;
    savingsList.innerHTML = "";
    return;
  }

  savingsPanel.hidden = false;
  savingsList.innerHTML = deals.map((deal) => {
    const savings = deal.savingsText || deal.promotionTag || "See offer";
    const missing = !deal.savingsText && !deal.promotionTag;
    const url = deal.url ? escapeHtml(deal.url) : "#";
    const name = escapeHtml(deal.name || "Unknown item");

    return `
      <li class="savings-item${missing ? " missing" : ""}">
        <span class="savings-name">${name}</span>
        <span class="savings-deal">${escapeHtml(savings)}</span>
        <a class="savings-link" href="${url}" target="_blank" rel="noopener noreferrer">View →</a>
      </li>`;
  }).join("");
}

function applySalesData(data, { cached } = {}) {
  saleInput.value = data.saleItems.join("\n");
  loadedDeals = data.deals || [];
  renderSavingsList(data.deals);
  const store = data.supermarket ? ` from ${data.supermarket}` : "";
  const withSavings = (data.deals || []).filter((d) => d.savingsText || d.promotionTag).length;
  const cachedNote = cached && data.cachedAt ? ` · stored ${data.cachedAt}` : "";
  fetchStatus.className = "fetch-status";
  fetchStatus.textContent = `Loaded ${data.count} deals${store} · ${withSavings} with savings found · ${data.ingredientCount} ingredients for matching${cachedNote}.`;
  saleInput.focus();
}

fetchSalesBtn.addEventListener("click", async () => {
  fetchSalesBtn.disabled = true;
  storedSalesBtn.disabled = true;
  fetchSalesBtn.textContent = "Reloading…";
  fetchStatus.hidden = false;
  fetchStatus.className = "fetch-status loading";
  fetchStatus.textContent = "Running the Apify scraper and checking Jumbo pages for savings… this can take a minute.";
  savingsPanel.hidden = true;

  try {
    const response = await fetch("/api/fetch-sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrichSavings: true })
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.error || "Could not fetch sales");
    }

    if (!data.saleItems?.length) {
      fetchStatus.className = "fetch-status error";
      fetchStatus.textContent = "No sale items found in the dataset.";
      showToast("No sales found");
      return;
    }

    applySalesData(data, { cached: false });
    const withSavings = (data.deals || []).filter((d) => d.savingsText || d.promotionTag).length;
    showToast(`Loaded ${withSavings} deals with savings (saved locally)`);
  } catch (error) {
    fetchStatus.className = "fetch-status error";
    fetchStatus.textContent = error.message;
    showToast(error.message);
  } finally {
    fetchSalesBtn.disabled = false;
    storedSalesBtn.disabled = false;
    fetchSalesBtn.textContent = "↻ Reload from Apify";
  }
});

storedSalesBtn.addEventListener("click", async () => {
  fetchSalesBtn.disabled = true;
  storedSalesBtn.disabled = true;
  storedSalesBtn.textContent = "Loading…";
  fetchStatus.hidden = false;
  fetchStatus.className = "fetch-status loading";
  fetchStatus.textContent = "Loading your stored sales…";
  savingsPanel.hidden = true;

  try {
    const response = await fetch("/api/stored-sales");
    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.error || "No stored sales found");
    }

    if (!data.saleItems?.length) {
      fetchStatus.className = "fetch-status error";
      fetchStatus.textContent = "No stored sale items found.";
      showToast("No stored sales");
      return;
    }

    applySalesData(data, { cached: true });
    showToast("Loaded stored sales");
  } catch (error) {
    fetchStatus.className = "fetch-status error";
    fetchStatus.textContent = error.message;
    showToast(error.message);
  } finally {
    fetchSalesBtn.disabled = false;
    storedSalesBtn.disabled = false;
    storedSalesBtn.textContent = "🗄 Use stored sales";
  }
});

backBtn.addEventListener("click", () => {
  stopAudio();
  recipeDetail.hidden = true;
  resultsPanel.hidden = false;
});

playAllBtn.addEventListener("click", playAllSteps);
stopBtn.addEventListener("click", stopAudio);

loadVoices();

fetch("/api/health")
  .then((res) => res.json())
  .then((data) => {
    if (!data.elevenlabsConfigured) {
      showToast("ElevenLabs key missing — audio won't work");
    }
    if (!data.apifyConfigured) {
      console.warn("Apify token missing — sale fetching disabled");
    }
    if (!data.llmConfigured) {
      console.warn("OpenAI key missing — using rule-based recipes");
    }
  })
  .catch(() => {
    showToast("Start the server with: py server.py");
  });
