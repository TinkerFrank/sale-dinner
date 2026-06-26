const saleInput = document.getElementById("sale-items");
const fetchSalesBtn = document.getElementById("fetch-sales-btn");
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
const inputScreen = document.querySelector(".input-page");
const assistantPanel = document.getElementById("assistant-panel");
const assistantStage = document.getElementById("assistant-stage");
const assistantStatus = document.getElementById("assistant-status");
const assistantCaption = document.getElementById("assistant-caption");
const assistantStepLabel = document.getElementById("assistant-step-label");
const assistantProgress = document.getElementById("assistant-progress");
const orbCore = document.getElementById("orb-core");
const stepConfirmBtn = document.getElementById("step-confirm-btn");
const voiceListenHint = document.getElementById("voice-listen-hint");
const assistantNow = document.getElementById("assistant-now");
const assistantNowText = document.getElementById("assistant-now-text");
const detailIngredients = document.getElementById("detail-ingredients");

let stepConfirmResolver = null;

let currentRecipe = null;
let loadedDeals = [];
let recipeSuggestions = new Map();
let audioCache = new Map();
let currentAudio = null;
let playAllAbort = false;
let playAllRunning = false;
let audioContext = null;
let vizRaf = null;
let assistantState = "idle";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let speechRecognizer = null;
let voiceListenActive = false;

const NEXT_STEP_PHRASES = [
  "next", "done", "ready", "finished", "finish", "continue", "ok", "okay",
  "got it", "all set", "next step", "move on", "go on", "complete", "yes",
  "klaar", "volgende", "oke", "oké", "klaar met", "verder", "volgende stap",
  "ga verder", "ik ben klaar", "fertig", "weiter",
];

function normalizeTranscript(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesNextCommand(transcript) {
  const text = normalizeTranscript(transcript);
  if (!text) return false;
  const words = text.split(" ");
  return NEXT_STEP_PHRASES.some((phrase) => {
    const p = normalizeTranscript(phrase);
    return text === p || text.includes(p) || words.includes(p);
  });
}

async function ensureMicrophoneReady() {
  if (!SpeechRecognition) return false;
  if (!navigator.mediaDevices?.getUserMedia) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    console.warn("Microphone permission:", error);
    return false;
  }
}

function setVoiceListenUI(active) {
  if (voiceListenHint) voiceListenHint.hidden = !active;
  assistantPanel?.classList.toggle("is-listening", active);
  if (assistantStatus) {
    assistantStatus.classList.toggle("listening", active);
    if (active) assistantStatus.textContent = "Listening";
    else if (assistantState === "waiting") assistantStatus.textContent = "Your turn";
  }
}

function stopVoiceListen() {
  voiceListenActive = false;
  setVoiceListenUI(false);
  if (speechRecognizer) {
    speechRecognizer.onresult = null;
    speechRecognizer.onend = null;
    speechRecognizer.onerror = null;
    try {
      speechRecognizer.stop();
    } catch {
      /* ignore */
    }
    speechRecognizer = null;
  }
}

function startVoiceListen(onMatch) {
  stopVoiceListen();

  if (!SpeechRecognition) return false;

  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = true;
  speechRecognizer.interimResults = true;
  speechRecognizer.lang = navigator.language?.startsWith("nl") ? "nl-NL" : "en-US";
  speechRecognizer.maxAlternatives = 3;
  voiceListenActive = true;
  setVoiceListenUI(true);

  speechRecognizer.onresult = (event) => {
    if (!voiceListenActive) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const heard = result[0]?.transcript || "";
      if (!heard.trim()) continue;

      if (result.isFinal || matchesNextCommand(heard)) {
        if (matchesNextCommand(heard)) {
          stopVoiceListen();
          showToast(`Heard: "${heard.trim()}"`);
          onMatch(heard);
          return;
        }
      }
    }
  };

  speechRecognizer.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    console.warn("Speech recognition:", event.error);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      stopVoiceListen();
      updateAssistantCaption("Microphone blocked — tap the button below to continue.");
      if (stepConfirmBtn) stepConfirmBtn.hidden = false;
    }
  };

  speechRecognizer.onend = () => {
    if (!voiceListenActive) return;
    setTimeout(() => {
      if (!voiceListenActive || !speechRecognizer) return;
      try {
        speechRecognizer.start();
      } catch {
        /* recognition will retry on next onend */
      }
    }, 250);
  };

  try {
    speechRecognizer.start();
    return true;
  } catch (error) {
    console.warn("Could not start speech recognition:", error);
    stopVoiceListen();
    return false;
  }
}

function setAssistantState(state) {
  assistantState = state;
  if (!assistantPanel) return;

  assistantPanel.classList.remove("is-loading", "is-speaking", "is-waiting", "is-active");
  assistantStatus.classList.remove("loading", "speaking", "waiting");

  if (state === "loading") {
    assistantPanel.classList.add("is-loading", "is-active");
    assistantStatus.classList.add("loading");
    assistantStatus.textContent = "Preparing";
  } else if (state === "speaking") {
    assistantPanel.classList.add("is-speaking", "is-active");
    assistantStatus.classList.add("speaking");
    assistantStatus.textContent = "Speaking";
    assistantPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else if (state === "waiting") {
    assistantPanel.classList.add("is-waiting", "is-active");
    assistantStatus.classList.add("waiting");
    assistantStatus.textContent = "Your turn";
  } else {
    assistantStatus.textContent = "Ready";
    stopVoiceListen();
    if (assistantNow) assistantNow.hidden = true;
    if (stepConfirmBtn) stepConfirmBtn.hidden = true;
  }
}

function showCurrentStep(stepIndex, stepText, total) {
  if (assistantNow) assistantNow.hidden = false;
  if (assistantNowText) assistantNowText.textContent = stepText;
  if (assistantStepLabel) {
    assistantStepLabel.textContent = `Step ${stepIndex + 1} of ${total}`;
  }

  document.querySelectorAll(".step-item").forEach((el, i) => {
    el.classList.toggle("current", i === stepIndex);
    el.classList.toggle("playing", i === stepIndex && (assistantState === "speaking" || assistantState === "waiting"));
  });
}

function waitForStepConfirm(stepIndex, total) {
  return new Promise((resolve) => {
    if (playAllAbort) {
      resolve(false);
      return;
    }

    setAssistantState("waiting");
    showCurrentStep(stepIndex, currentRecipe.steps[stepIndex], total);

    stepConfirmResolver = (confirmed) => {
      stopVoiceListen();
      stepConfirmResolver = null;
      if (stepConfirmBtn) stepConfirmBtn.hidden = true;
      resolve(confirmed);
    };

    if (stepConfirmBtn) {
      stepConfirmBtn.hidden = false;
      stepConfirmBtn.textContent =
        stepIndex < total - 1 ? "Done — next step" : "Finish cook-along";
    }

    const beginListening = () => {
      if (playAllAbort || !stepConfirmResolver) return;

      const voiceStarted = startVoiceListen(() => resolveStepConfirm(true));
      if (voiceStarted) {
        updateAssistantCaption('Say "next" or "done" when you finish this step.');
      } else {
        updateAssistantCaption("Voice unavailable — tap the button when you've finished this step.");
      }
    };

    // Pause after TTS so the microphone is not competing with speaker output.
    setTimeout(beginListening, 400);
  });
}

function resolveStepConfirm(confirmed = true) {
  if (stepConfirmResolver) stepConfirmResolver(confirmed);
}

function updateAssistantCaption(text) {
  if (!assistantCaption) return;
  assistantCaption.classList.add("is-updating");
  setTimeout(() => {
    assistantCaption.textContent = text;
    assistantCaption.classList.remove("is-updating");
  }, 180);
}

function setActiveStep(stepIndex, total) {
  showCurrentStep(stepIndex, currentRecipe?.steps?.[stepIndex] || "", total);

  assistantProgress?.querySelectorAll(".progress-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === stepIndex);
    dot.classList.toggle("done", i < stepIndex);
  });

  document.querySelectorAll(".step-play").forEach((btn, i) => {
    btn.classList.toggle("is-active", i === stepIndex && assistantState === "speaking");
  });
}

function renderAssistantProgress(stepCount) {
  if (!assistantProgress) return;

  assistantProgress.innerHTML = Array.from({ length: stepCount }, (_, i) =>
    `<button type="button" class="progress-dot" data-step="${i}" aria-label="Go to step ${i + 1}"></button>`
  ).join("");

  assistantProgress.querySelectorAll(".progress-dot").forEach((dot) => {
    dot.addEventListener("click", async () => {
      if (!currentRecipe || assistantState === "loading") return;
      stopAudio();
      playAllAbort = false;
      const idx = Number(dot.dataset.step);
      await speakStep(idx, currentRecipe.steps[idx]);
    });
  });
}

function resetAssistant(recipe) {
  setAssistantState("idle");
  stopVisualizer();
  if (recipe) {
    renderAssistantProgress(recipe.steps.length);
    updateAssistantCaption('Say "next" or "done" after each step — fully hands-free.');
    if (assistantStepLabel) assistantStepLabel.textContent = "Guided cook-along";
  }
  stopBtn.hidden = true;
  playAllBtn.disabled = false;
  playAllBtn.textContent = "Start guided cook-along";
  if (stepConfirmBtn) stepConfirmBtn.hidden = true;
  if (assistantNow) assistantNow.hidden = true;
}

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function startVisualizer(audio) {
  stopVisualizer();
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();

  let source;
  try {
    source = ctx.createMediaElementSource(audio);
  } catch {
    return;
  }

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  source.connect(analyser);
  analyser.connect(ctx.destination);

  const bins = new Uint8Array(analyser.frequencyBinCount);

  function tick() {
    analyser.getByteFrequencyData(bins);
    let sum = 0;
    for (let i = 0; i < bins.length; i++) sum += bins[i];
    const level = sum / bins.length / 255;
    const scale = 1 + level * 0.3;
    if (orbCore) orbCore.style.transform = `scale(${scale})`;
    vizRaf = requestAnimationFrame(tick);
  }
  tick();
}

function stopVisualizer() {
  if (vizRaf) cancelAnimationFrame(vizRaf);
  vizRaf = null;
  if (orbCore) orbCore.style.transform = "";
}

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
  stopVisualizer();
  stopVoiceListen();
  resolveStepConfirm(false);
  document.querySelectorAll(".step-item.playing, .step-item.current").forEach((el) => {
    el.classList.remove("playing", "current");
  });
  document.querySelectorAll(".step-play.is-active").forEach((el) => {
    el.classList.remove("is-active");
  });
  setAssistantState("idle");
  stopBtn.hidden = true;
  playAllBtn.disabled = false;
  playAllBtn.textContent = "Start guided cook-along";
  if (stepConfirmBtn) stepConfirmBtn.hidden = true;
  if (voiceListenHint) voiceListenHint.hidden = true;
}

function playAudioBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    audio.onplay = () => startVisualizer(audio);

    audio.onended = () => {
      stopVisualizer();
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    };

    audio.onerror = () => {
      stopVisualizer();
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
  stopVoiceListen();
  const stepEl = stepsList.children[stepIndex];
  const playBtn = stepEl.querySelector(".step-play");
  const total = currentRecipe?.steps.length || 0;

  setAssistantState("loading");
  setActiveStep(stepIndex, total);
  updateAssistantCaption(stepText);
  stopBtn.hidden = false;
  playAllBtn.disabled = true;

  stepEl.classList.add("playing");
  playBtn.disabled = true;
  playBtn.textContent = "…";
  playBtn.classList.add("is-active");

  try {
    const intro = `Step ${stepIndex + 1}. ${stepText}`;
    const blob = await fetchSpeech(intro);
    if (playAllAbort) return;

    setAssistantState("speaking");
    setActiveStep(stepIndex, total);
    await playAudioBlob(blob);
    if (playAllAbort) return;

    await ensureMicrophoneReady();
    const confirmed = await waitForStepConfirm(stepIndex, total);
    if (!confirmed || playAllAbort) return;

    stepEl.classList.remove("playing", "current");
    stepEl.classList.add("done");
    playBtn.classList.remove("is-active");

    assistantProgress?.querySelectorAll(".progress-dot").forEach((dot, i) => {
      if (i === stepIndex) dot.classList.add("done");
      dot.classList.remove("active");
    });

    if (!playAllRunning) {
      setAssistantState("idle");
      stopBtn.hidden = true;
      playAllBtn.disabled = false;
      updateAssistantCaption("Step complete. Start again or pick another step.");
    }
  } catch (error) {
    stepEl.classList.remove("playing");
    playBtn.classList.remove("is-active");
    setAssistantState("idle");
    showToast(error.message);
    throw error;
  } finally {
    playBtn.disabled = false;
    playBtn.textContent = "Assisted-AI";
  }
}

async function playAllSteps() {
  if (!currentRecipe) return;

  const micReady = await ensureMicrophoneReady();
  if (!micReady && SpeechRecognition) {
    showToast("Allow microphone access for hands-free “next” commands");
  }

  playAllAbort = false;
  playAllRunning = true;
  playAllBtn.disabled = true;
  playAllBtn.textContent = "Guiding…";
  stopBtn.hidden = false;

  document.querySelectorAll(".step-item.done").forEach((el) => el.classList.remove("done"));
  assistantProgress?.querySelectorAll(".progress-dot.done").forEach((dot) => dot.classList.remove("done"));

  try {
    for (let i = 0; i < currentRecipe.steps.length; i++) {
      if (playAllAbort) break;
      await speakStep(i, currentRecipe.steps[i]);
    }
  } finally {
    playAllRunning = false;
  }

  setAssistantState("idle");
  stopBtn.hidden = true;
  playAllBtn.disabled = false;
  playAllBtn.textContent = "Start guided cook-along";
  updateAssistantCaption("All steps complete — enjoy your dinner!");

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

function coverFallback(event) {
  event.target.onerror = null;
  event.target.src = window.RecipeCovers?.DEFAULT_COVER || "/images/covers/dinner.svg";
}
window.coverFallback = coverFallback;

function enrichRecipe(recipe) {
  let r = recipe;
  if (window.RecipeCovers?.attachRecipeCover) r = window.RecipeCovers.attachRecipeCover(r);
  if (window.RecipeIngredients?.attachMeasuredIngredients) r = window.RecipeIngredients.attachMeasuredIngredients(r);
  return r;
}

function renderDetailIngredients(recipe) {
  if (!detailIngredients) return;

  const note = document.getElementById("ingredients-servings-note");
  if (note) note.textContent = `Amounts for ${recipe.servings || 4} servings.`;

  const items = recipe.measuredIngredients || [];
  detailIngredients.innerHTML = items.map((item) => `
    <li class="ingredient-row">
      <span class="ing-amount">${escapeHtml(item.amount)}</span>
      <span class="ing-name">${escapeHtml(item.name)}</span>
    </li>
  `).join("");
}

function withCover(recipe) {
  return enrichRecipe(recipe);
}

function renderRecipeCards(suggestions, saleItems) {
  const enriched = suggestions.map(withCover);
  recipeSuggestions = new Map(enriched.map((r) => [r.id, r]));

  if (suggestions.length === 0) {
    recipeCards.innerHTML = `
      <div class="empty-state">
        <p>No strong matches found. Try adding more proteins or vegetables from the flyer.</p>
      </div>`;
    resultsSummary.textContent = `Searched ${saleItems.length} sale item${saleItems.length === 1 ? "" : "s"}.`;
    return;
  }

  resultsSummary.textContent = `Found ${suggestions.length} custom recipe${suggestions.length === 1 ? "" : "s"} from ${saleItems.length} sale item${saleItems.length === 1 ? "" : "s"}.`;

  recipeCards.innerHTML = enriched.map((recipe) => {
    const saleTags = (recipe.saleIngredients || recipe.matchedIngredients || []).slice(0, 4);
    const pantryCount = (recipe.pantryIngredients || []).length;
    const coverAlt = `${recipe.name} — ${recipe.coverLabel || "dinner"}`;

    return `
    <article class="recipe-card" data-id="${recipe.id}" tabindex="0" role="button" aria-label="View ${recipe.name}">
      <div class="recipe-card-cover">
        <img src="${escapeHtml(recipe.cover)}" alt="${escapeHtml(coverAlt)}" loading="lazy" class="recipe-cover-img" onerror="coverFallback(event)">
        <span class="cover-tag">${escapeHtml(recipe.coverLabel || "Dinner")}</span>
      </div>
      <div class="recipe-card-body">
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
      </div>
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

  currentRecipe = withCover(recipe);
  stopAudio();
  audioCache.clear();

  const detailCover = document.getElementById("detail-cover");
  const detailCoverLabel = document.getElementById("detail-cover-label");
  if (detailCover) {
    detailCover.onerror = coverFallback;
    detailCover.src = currentRecipe.cover;
    detailCover.alt = `${currentRecipe.name} cover`;
  }
  if (detailCoverLabel) {
    detailCoverLabel.textContent = currentRecipe.coverLabel || "Dinner";
  }

  detailName.textContent = currentRecipe.name;
  detailDesc.textContent = currentRecipe.description;
  detailTime.textContent = currentRecipe.time;
  detailServings.textContent = `Serves ${currentRecipe.servings}`;

  const breadcrumbName = document.getElementById("breadcrumb-name");
  if (breadcrumbName) breadcrumbName.textContent = currentRecipe.name;

  detailSaleItems.innerHTML = (currentRecipe.saleIngredients || currentRecipe.matchedIngredients || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  detailPantry.innerHTML = (currentRecipe.pantryIngredients || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  renderRecipeSavings(currentRecipe);
  renderDetailIngredients(currentRecipe);

  stepsList.innerHTML = currentRecipe.steps.map((step, index) => `
    <li class="step-item" data-step="${index}">
      <div class="step-header">
        <h3 class="step-heading">Step ${index + 1}</h3>
        <button type="button" class="step-play" data-step="${index}" aria-label="Assisted-AI for step ${index + 1}">Assisted-AI</button>
      </div>
      <p class="step-text">${escapeHtml(step)}</p>
    </li>
  `).join("");

  resetAssistant(currentRecipe);

  stepsList.querySelectorAll(".step-play").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      stopAudio();
      playAllAbort = false;
      const idx = Number(btn.dataset.step);
      await speakStep(idx, currentRecipe.steps[idx]);
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

    const data = await parseJsonResponse(response);
    renderRecipeCards(data.suggestions, data.saleItems);

    resultsPanel.hidden = false;
    if (inputScreen) inputScreen.hidden = true;
    recipeDetail.hidden = true;
    resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch {
    showToast("Something went wrong. Is the server running?");
  } finally {
    suggestBtn.disabled = false;
    suggestBtn.textContent = "Find dinner ideas";
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
    const preview = text.trim().slice(0, 80);
    throw new Error(
      preview.startsWith("<") || preview.startsWith("A server")
        ? "API unavailable — check Vercel env vars and redeploy"
        : `Invalid server response: ${preview}`
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

async function loadSalesFromApi({ silent = false } = {}) {
  if (!silent) {
    fetchSalesBtn.disabled = true;
    fetchSalesBtn.textContent = "Loading sales…";
  }
  fetchStatus.hidden = false;
  fetchStatus.className = "status-text loading";
  fetchStatus.textContent = silent
    ? "Loading demo Jumbo deals…"
    : "Loading Jumbo sales from Apify (Dutch Supermarkets actor)…";
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
      fetchStatus.className = "status-text error";
      fetchStatus.textContent = "No sale items found in the dataset.";
      if (!silent) showToast("No sales found");
      return;
    }

    saleInput.value = data.saleItems.join("\n");
    loadedDeals = data.deals || [];
    renderSavingsList(data.deals);
    const store = data.supermarket ? ` from ${data.supermarket}` : "";
    const withSavings = data.deals.filter((d) => d.savingsText || d.promotionTag).length;
    const demoLabel = data.demo ? " (demo)" : "";
    fetchStatus.className = "status-text";
    fetchStatus.textContent = `Loaded ${data.count} deals${store}${demoLabel} · ${withSavings} with savings found · ${data.ingredientCount} ingredients for matching.`;
    if (!silent) {
      showToast(data.demo ? `Loaded ${withSavings} demo deals` : `Loaded ${withSavings} deals with savings`);
      saleInput.focus();
    }
  } catch (error) {
    fetchStatus.className = "status-text error";
    fetchStatus.textContent = error.message;
    if (!silent) showToast(error.message);
  } finally {
    fetchSalesBtn.disabled = false;
    fetchSalesBtn.textContent = "↓ Load sales from Apify";
  }
}

fetchSalesBtn.addEventListener("click", () => loadSalesFromApi());

backBtn.addEventListener("click", () => {
  stopAudio();
  recipeDetail.hidden = true;
  resultsPanel.hidden = false;
  if (inputScreen) inputScreen.hidden = false;
});

playAllBtn.addEventListener("click", playAllSteps);
stopBtn.addEventListener("click", stopAudio);
stepConfirmBtn?.addEventListener("click", () => resolveStepConfirm(true));

loadVoices();

fetch("/api/health")
  .then((res) => parseJsonResponse(res))
  .then((data) => {
    if (!data.elevenlabsConfigured) {
      showToast("Assisted-AI voice key missing — audio won't work");
    }
    if (!data.apifyConfigured || data.demoSalesAvailable) {
      loadSalesFromApi({ silent: true });
    }
  })
  .catch(() => {
    showToast("Start the server with: npm start");
  });
