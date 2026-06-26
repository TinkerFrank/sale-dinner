/** Default amounts for common ingredients when no recipe-specific measure exists. */
const DEFAULT_AMOUNTS = {
  "chicken breast": "600 g",
  "chicken thighs": "600 g",
  broccoli: "300 g (2 cups)",
  carrots: "2 medium (200 g)",
  zucchini: "1 medium (250 g)",
  "bell pepper": "2 medium",
  garlic: "4 cloves",
  butter: "30 g (2 tbsp)",
  "olive oil": "2 tbsp",
  lemon: "1 whole",
  salt: "to taste",
  pepper: "to taste",
  paprika: "1 tsp",
  pasta: "400 g",
  spaghetti: "400 g",
  penne: "400 g",
  linguine: "400 g",
  "cherry tomatoes": "250 g (2 cups)",
  tomatoes: "3 medium",
  spinach: "150 g (5 cups)",
  parmesan: "50 g (½ cup)",
  basil: "small handful",
  "ground beef": "500 g",
  tortillas: "8 small",
  onion: "1 large",
  lettuce: "1 head",
  cheddar: "100 g (1 cup)",
  cheese: "100 g (1 cup)",
  "sour cream": "120 ml (½ cup)",
  lime: "2 limes",
  cilantro: "small bunch",
  "taco seasoning": "1 packet (30 g)",
  salmon: "600 g (4 fillets)",
  "salmon fillet": "600 g (4 fillets)",
  potatoes: "700 g (5 medium)",
  asparagus: "300 g (1 bunch)",
  "green beans": "300 g",
  dill: "2 tbsp chopped",
  rice: "300 g (1½ cups)",
  ginger: "2 cm piece",
  "soy sauce": "3 tbsp",
  "sesame oil": "1 tsp",
  "vegetable oil": "2 tbsp",
  cornstarch: "1 tsp",
  "snap peas": "200 g",
  "black beans": "400 g (2 cans)",
  "kidney beans": "400 g (2 cans)",
  "canned tomatoes": "800 g (2 cans)",
  corn: "200 g (1 cup)",
  "chili powder": "2 tbsp",
  cumin: "1 tbsp",
  "vegetable broth": "750 ml (3 cups)",
  "pork chops": "4 chops (600 g)",
  pork: "600 g",
  apples: "2 medium",
  "chicken broth": "250 ml (1 cup)",
  thyme: "1 tsp dried",
  shrimp: "400 g",
  parsley: "small bunch",
  "red pepper flakes": "pinch",
  "white wine": "120 ml (½ cup)",
};

function normalizeName(text) {
  return String(text || "").toLowerCase().trim();
}

function guessAmount(name) {
  const key = normalizeName(name);
  if (DEFAULT_AMOUNTS[key]) return DEFAULT_AMOUNTS[key];
  for (const [pattern, amount] of Object.entries(DEFAULT_AMOUNTS)) {
    if (key.includes(pattern) || pattern.includes(key)) return amount;
  }
  return "as needed";
}

function buildMeasuredIngredients(recipe) {
  if (recipe.measuredIngredients?.length) return recipe.measuredIngredients;

  const RECIPE_MEASURES = require("./recipe-measures.json");
  if (recipe.id && RECIPE_MEASURES[recipe.id]) return RECIPE_MEASURES[recipe.id];

  const names = [
    ...(recipe.saleIngredients || recipe.matchedIngredients || []),
    ...(recipe.pantryIngredients || []),
  ];

  const unique = [...new Set(names.length ? names : recipe.ingredients || [])];

  return unique.map((name) => ({
    name,
    amount: guessAmount(name),
  }));
}

function attachMeasuredIngredients(recipe) {
  return {
    ...recipe,
    measuredIngredients: buildMeasuredIngredients(recipe),
  };
}

module.exports = {
  DEFAULT_AMOUNTS,
  guessAmount,
  buildMeasuredIngredients,
  attachMeasuredIngredients,
};
