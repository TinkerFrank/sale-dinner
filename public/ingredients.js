(function () {
  "use strict";

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

  const RECIPE_MEASURES = {
    "garlic-butter-chicken": [
      { name: "chicken breast", amount: "600 g" },
      { name: "broccoli", amount: "300 g (2 cups), chopped" },
      { name: "carrots", amount: "2 medium (200 g), sliced" },
      { name: "garlic", amount: "4 cloves, minced" },
      { name: "butter", amount: "30 g (2 tbsp)" },
      { name: "olive oil", amount: "1 tbsp" },
      { name: "lemon", amount: "1 whole, juiced" },
      { name: "paprika", amount: "1 tsp" },
      { name: "salt & pepper", amount: "to taste" },
    ],
    "pasta-primavera": [
      { name: "pasta", amount: "400 g" },
      { name: "zucchini", amount: "1 medium (250 g), diced" },
      { name: "bell pepper", amount: "2 medium, sliced" },
      { name: "cherry tomatoes", amount: "250 g (2 cups), halved" },
      { name: "broccoli", amount: "200 g (2 cups), florets" },
      { name: "spinach", amount: "150 g (5 cups)" },
      { name: "garlic", amount: "3 cloves, minced" },
      { name: "olive oil", amount: "3 tbsp" },
      { name: "parmesan", amount: "50 g (½ cup), grated" },
      { name: "basil", amount: "small handful" },
    ],
    "beef-tacos": [
      { name: "ground beef", amount: "500 g" },
      { name: "tortillas", amount: "8 small" },
      { name: "onion", amount: "1 large, diced" },
      { name: "tomatoes", amount: "3 medium, diced" },
      { name: "lettuce", amount: "½ head, shredded" },
      { name: "cheddar", amount: "100 g (1 cup), crumbled" },
      { name: "sour cream", amount: "120 ml (½ cup)" },
      { name: "lime", amount: "2 limes, wedged" },
      { name: "cilantro", amount: "small bunch, chopped" },
      { name: "taco seasoning", amount: "1 packet (30 g)" },
      { name: "garlic", amount: "2 cloves, minced" },
    ],
    "salmon-sheet-pan": [
      { name: "salmon fillet", amount: "600 g (4 portions)" },
      { name: "potatoes", amount: "700 g (5 medium), cubed" },
      { name: "asparagus", amount: "300 g (1 bunch), trimmed" },
      { name: "garlic", amount: "3 cloves, minced" },
      { name: "olive oil", amount: "3 tbsp" },
      { name: "lemon", amount: "1 whole, sliced" },
      { name: "dill", amount: "2 tbsp, chopped" },
      { name: "salt & pepper", amount: "to taste" },
    ],
    "chicken-stir-fry": [
      { name: "chicken breast", amount: "600 g, sliced" },
      { name: "broccoli", amount: "250 g (2 cups), florets" },
      { name: "bell pepper", amount: "2 medium, sliced" },
      { name: "carrots", amount: "2 medium (200 g), julienned" },
      { name: "snap peas", amount: "200 g" },
      { name: "onion", amount: "1 medium, sliced" },
      { name: "rice", amount: "300 g (1½ cups), uncooked" },
      { name: "soy sauce", amount: "3 tbsp" },
      { name: "garlic", amount: "3 cloves, minced" },
      { name: "ginger", amount: "2 cm, grated" },
      { name: "sesame oil", amount: "1 tsp" },
      { name: "vegetable oil", amount: "2 tbsp" },
      { name: "cornstarch", amount: "1 tsp" },
    ],
    "veggie-chili": [
      { name: "black beans", amount: "400 g (2 cans), drained" },
      { name: "kidney beans", amount: "400 g (2 cans), drained" },
      { name: "canned tomatoes", amount: "800 g (2 cans)" },
      { name: "onion", amount: "1 large, diced" },
      { name: "bell pepper", amount: "2 medium, diced" },
      { name: "corn", amount: "200 g (1 cup)" },
      { name: "vegetable broth", amount: "750 ml (3 cups)" },
      { name: "chili powder", amount: "2 tbsp" },
      { name: "cumin", amount: "1 tbsp" },
      { name: "garlic", amount: "4 cloves, minced" },
      { name: "cheddar", amount: "100 g (1 cup), for serving" },
      { name: "sour cream", amount: "120 ml (½ cup), for serving" },
    ],
    "pork-chops-apples": [
      { name: "pork chops", amount: "4 chops (600 g)" },
      { name: "apples", amount: "2 medium, sliced" },
      { name: "onion", amount: "1 medium, sliced" },
      { name: "chicken broth", amount: "250 ml (1 cup)" },
      { name: "butter", amount: "30 g (2 tbsp)" },
      { name: "olive oil", amount: "1 tbsp" },
      { name: "garlic", amount: "2 cloves, minced" },
      { name: "thyme", amount: "1 tsp dried" },
      { name: "salt & pepper", amount: "to taste" },
    ],
    "shrimp-garlic-pasta": [
      { name: "shrimp", amount: "400 g, peeled" },
      { name: "linguine", amount: "400 g" },
      { name: "garlic", amount: "6 cloves, minced" },
      { name: "butter", amount: "30 g (2 tbsp)" },
      { name: "olive oil", amount: "2 tbsp" },
      { name: "white wine", amount: "120 ml (½ cup)" },
      { name: "lemon", amount: "1 whole, juiced" },
      { name: "parsley", amount: "small bunch, chopped" },
      { name: "parmesan", amount: "40 g (⅓ cup)" },
      { name: "red pepper flakes", amount: "pinch" },
    ],
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
    if (recipe.id && RECIPE_MEASURES[recipe.id]) return RECIPE_MEASURES[recipe.id];

    const names = [
      ...(recipe.saleIngredients || recipe.matchedIngredients || []),
      ...(recipe.pantryIngredients || []),
    ];
    const unique = [...new Set(names.length ? names : recipe.ingredients || [])];
    return unique.map((name) => ({ name, amount: guessAmount(name) }));
  }

  function attachMeasuredIngredients(recipe) {
    return {
      ...recipe,
      measuredIngredients: buildMeasuredIngredients(recipe),
    };
  }

  window.RecipeIngredients = {
    buildMeasuredIngredients,
    attachMeasuredIngredients,
  };
})();
