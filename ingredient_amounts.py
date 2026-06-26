"""Estimate ingredient amounts for generated recipes."""

import re

DEFAULT_AMOUNTS = {
    "chicken": "600 g",
    "beef": "500 g",
    "pork": "600 g",
    "salmon": "600 g",
    "shrimp": "400 g",
    "fish": "500 g",
    "pasta": "400 g",
    "rice": "300 g (1½ cups)",
    "potato": "700 g",
    "broccoli": "300 g (2 cups)",
    "onion": "1 large",
    "garlic": "4 cloves",
    "tomato": "3 medium",
    "pepper": "2 medium",
    "cheese": "100 g (1 cup)",
    "butter": "30 g (2 tbsp)",
    "oil": "2 tbsp",
    "lemon": "1 whole",
    "bean": "400 g (2 cans)",
    "corn": "200 g (1 cup)",
    "tortilla": "8 small",
    "lettuce": "1 head",
    "apple": "2 medium",
    "spinach": "150 g",
    "mushroom": "250 g",
    "carrot": "2 medium (200 g)",
    "zucchini": "1 medium",
    "asparagus": "300 g",
}


def _normalize(text):
    return re.sub(r"\s+", " ", str(text or "").lower()).strip()


def guess_amount(name):
    key = _normalize(name)
    for pattern, amount in DEFAULT_AMOUNTS.items():
        if pattern in key:
            return amount
    return "as needed"


def build_measured_ingredients(recipe):
    if recipe.get("measuredIngredients"):
        return recipe["measuredIngredients"]

    names = list(recipe.get("saleIngredients") or []) + list(recipe.get("pantryIngredients") or [])
    if not names:
        names = list(recipe.get("ingredients") or [])

    seen = set()
    measured = []
    for name in names:
        norm = _normalize(name)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        measured.append({"name": name, "amount": guess_amount(name)})
    return measured


def attach_measured_ingredients(recipe):
    return {**recipe, "measuredIngredients": build_measured_ingredients(recipe)}
