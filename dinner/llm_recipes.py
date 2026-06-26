"""Generate dinner recipes using an OpenAI-compatible LLM API."""

import json
import os
import re
import urllib.error
import urllib.request

from savings_utils import compute_recipe_savings


def _normalize(text):
    return re.sub(r"\s+", " ", text.lower()).strip()


def _sale_item_used(recipe_sale_items, available_sale_items):
    if not recipe_sale_items:
        return False
    available = {_normalize(item) for item in available_sale_items}
    for item in recipe_sale_items:
        norm = _normalize(item)
        if norm in available:
            return True
        for sale in available_sale_items:
            s = _normalize(sale)
            if norm in s or s in norm:
                return True
    return False


def _build_prompt(sale_items, deals, limit):
    deal_lines = []
    for deal in (deals or [])[:40]:
        name = deal.get("name") or ""
        promo = deal.get("savingsText") or deal.get("promotionTag") or ""
        if name:
            deal_lines.append(f"- {name}" + (f" ({promo})" if promo else ""))

    sale_block = "\n".join(f"- {item}" for item in sale_items[:50])
    deal_block = "\n".join(deal_lines) if deal_lines else "No deal details available."

    return f"""You are a practical home-cook creating weeknight dinners from grocery sale items.

SALE ITEMS (must use at least one per recipe — prefer 2–4 sale items when they fit well):
{sale_block}

CURRENT DEALS:
{deal_block}

Create exactly {limit} different dinner recipes. Rules:
1. Every recipe MUST include at least one ingredient from the sale list above (use exact sale names when possible).
2. You MAY add common pantry staples (oil, salt, pepper, garlic, butter, pasta, rice, lemon, soy sauce, etc.).
3. Do NOT pair savory proteins with dessert fruit unless it makes culinary sense.
4. Keep recipes realistic for 4 servings, 20–45 minutes.
5. Steps should be clear, numbered-friendly sentences suitable for text-to-speech (no markdown).
6. Mix styles: e.g. skillet, pasta, sheet pan, bowl — don't repeat the same format.

Respond with ONLY valid JSON in this shape:
{{
  "recipes": [
    {{
      "name": "Recipe title",
      "description": "One sentence",
      "time": "30 min",
      "servings": 4,
      "saleIngredients": ["exact sale item names used"],
      "pantryIngredients": ["pantry items added"],
      "steps": ["step 1", "step 2", "step 3"]
    }}
  ]
}}"""


def _call_openai(api_key, prompt, model):
    url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1/chat/completions")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You output only valid JSON. You create practical, appetizing dinner recipes.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.8,
        "response_format": {"type": "json_object"},
    }

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=90) as response:
        data = json.loads(response.read().decode("utf-8"))

    content = data["choices"][0]["message"]["content"]
    return json.loads(content)


def _finalize_recipe(raw, index, sale_items, deals):
    import hashlib

    name = (raw.get("name") or f"Sale Item Dinner {index + 1}").strip()
    sale_ingredients = [s.strip() for s in (raw.get("saleIngredients") or []) if s and s.strip()]
    pantry_ingredients = [s.strip() for s in (raw.get("pantryIngredients") or []) if s and s.strip()]
    steps = [s.strip() for s in (raw.get("steps") or []) if s and s.strip()]

    if not _sale_item_used(sale_ingredients, sale_items):
        return None
    if len(steps) < 3:
        return None

    digest = hashlib.md5(f"{name}-{index}".encode()).hexdigest()[:8]
    recipe = {
        "id": f"gen-{digest}",
        "name": name,
        "description": (raw.get("description") or "A custom dinner built from this week's sale items.").strip(),
        "time": (raw.get("time") or "30 min").strip(),
        "servings": int(raw.get("servings") or 4),
        "tags": ["generated", "sale-based", "ai"],
        "ingredients": sale_ingredients + pantry_ingredients,
        "saleIngredients": sale_ingredients,
        "pantryIngredients": pantry_ingredients,
        "matchedIngredients": sale_ingredients,
        "steps": steps,
    }
    return {**recipe, **compute_recipe_savings(sale_ingredients, deals or [])}


def generate_recipes_with_llm(sale_items, limit=3, deals=None):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    prompt = _build_prompt(sale_items, deals, limit)

    try:
        parsed = _call_openai(api_key, prompt, model)
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        print(f"OpenAI error {error.code}: {details[:300]}")
        return None
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError) as error:
        print(f"LLM recipe generation failed: {error}")
        return None

    raw_recipes = parsed.get("recipes") if isinstance(parsed, dict) else parsed
    if not isinstance(raw_recipes, list):
        return None

    recipes = []
    for index, raw in enumerate(raw_recipes):
        if not isinstance(raw, dict):
            continue
        recipe = _finalize_recipe(raw, index, sale_items, deals)
        if recipe:
            recipes.append(recipe)

    return recipes[:limit] if recipes else None
