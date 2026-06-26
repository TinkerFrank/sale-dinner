const COVER_BASE = "/images/covers";
const DEFAULT_COVER = `${COVER_BASE}/dinner.svg`;

const RECIPE_ID_COVERS = {
  "garlic-butter-chicken": `${COVER_BASE}/chicken.svg`,
  "pasta-primavera": `${COVER_BASE}/pasta.svg`,
  "beef-tacos": `${COVER_BASE}/tacos.svg`,
  "salmon-sheet-pan": `${COVER_BASE}/salmon.svg`,
  "chicken-stir-fry": `${COVER_BASE}/stir-fry.svg`,
  "veggie-chili": `${COVER_BASE}/chili.svg`,
  "pork-chops-apples": `${COVER_BASE}/pork.svg`,
  "shrimp-garlic-pasta": `${COVER_BASE}/shrimp.svg`,
};

const KEYWORD_COVERS = [
  { keys: ["taco", "tortilla", "burrito"], url: `${COVER_BASE}/tacos.svg`, label: "Tacos" },
  { keys: ["salmon", "zalm", "fish", "vis"], url: `${COVER_BASE}/salmon.svg`, label: "Seafood" },
  { keys: ["shrimp", "garnalen", "scampi", "prawn"], url: `${COVER_BASE}/shrimp.svg`, label: "Shrimp" },
  { keys: ["chicken", "kip", "poultry"], url: `${COVER_BASE}/chicken.svg`, label: "Chicken" },
  { keys: ["beef", "gehakt", "steak", "burger", "rund"], url: `${COVER_BASE}/beef.svg`, label: "Beef" },
  { keys: ["pork", "varken", "ham", "bacon"], url: `${COVER_BASE}/pork.svg`, label: "Pork" },
  { keys: ["pasta", "spaghetti", "penne", "linguine", "noodle"], url: `${COVER_BASE}/pasta.svg`, label: "Pasta" },
  { keys: ["rice", "rijst", "bowl"], url: `${COVER_BASE}/rice.svg`, label: "Rice bowl" },
  { keys: ["stir fry", "stir-fry", "wok"], url: `${COVER_BASE}/stir-fry.svg`, label: "Stir-fry" },
  { keys: ["sheet pan", "roast", "oven"], url: `${COVER_BASE}/sheet-pan.svg`, label: "Sheet pan" },
  { keys: ["chili", "stew", "soup"], url: `${COVER_BASE}/chili.svg`, label: "One-pot" },
  { keys: ["salad", "veggie", "vegetable", "broccoli", "spinach"], url: `${COVER_BASE}/veggie.svg`, label: "Veggie" },
];

function normalize(text) {
  return String(text || "").toLowerCase();
}

function recipeHaystack(recipe) {
  return normalize([
    recipe.id,
    recipe.name,
    recipe.description,
    ...(recipe.saleIngredients || []),
    ...(recipe.matchedIngredients || []),
    ...(recipe.ingredients || []),
    ...(recipe.pantryIngredients || []),
    ...(recipe.tags || []),
  ].join(" "));
}

function getRecipeCover(recipe) {
  if (recipe?.cover) return recipe.cover;
  if (recipe?.id && RECIPE_ID_COVERS[recipe.id]) return RECIPE_ID_COVERS[recipe.id];

  const haystack = recipeHaystack(recipe);
  for (const entry of KEYWORD_COVERS) {
    if (entry.keys.some((key) => haystack.includes(key))) return entry.url;
  }
  return DEFAULT_COVER;
}

function getRecipeCoverLabel(recipe) {
  if (recipe?.coverLabel) return recipe.coverLabel;

  const haystack = recipeHaystack(recipe);
  for (const entry of KEYWORD_COVERS) {
    if (entry.keys.some((key) => haystack.includes(key))) return entry.label;
  }
  return "Dinner";
}

function attachRecipeCover(recipe) {
  return {
    ...recipe,
    cover: getRecipeCover(recipe),
    coverLabel: getRecipeCoverLabel(recipe),
  };
}

module.exports = {
  COVER_BASE,
  DEFAULT_COVER,
  getRecipeCover,
  getRecipeCoverLabel,
  attachRecipeCover,
};
