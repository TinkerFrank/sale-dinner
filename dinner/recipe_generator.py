"""Generate custom dinner recipes from sale items (≥1 sale ingredient required)."""

import hashlib
import re

from savings_utils import compute_recipe_savings
from ingredient_amounts import attach_measured_ingredients

PANTRY = [
    "olive oil", "salt", "pepper", "garlic", "onion", "butter",
    "lemon", "vegetable oil", "paprika",
]

CATEGORY_PATTERNS = {
    "protein": [
        "chicken", "kip", "beef", "gehakt", "rund", "pork", "varken", "ham",
        "salmon", "zalm", "shrimp", "garnalen", "scampi", "fish", "vis", "tofu",
        "burger", "worst", "drumstick", "filet", "reepjes", "vleesvervanger",
    ],
    "veg": [
        "broccoli", "bimi", "tomato", "tomaat", "paprika", "spinach",
        "sla", "carrot", "wortel", "zucchini", "courgette", "asparagus", "asperge",
        "beans", "bonen", "corn", "mais", "mushroom", "champignon", "cucumber",
        "komkommer", "avocado", "pumpkin", "pompoen", "groente", "vegetable",
        "romaine", "melange", "slamix", "tomaatje",
    ],
    "fruit": [
        "aardbei", "strawberr", "appel", "apple", "kiwi", "melon", "perzik", "peach",
        "fruit", "peer", "banaan", "druif", "citroen", "lemon",
    ],
    "starch": [
        "pasta", "spaghetti", "penne", "rice", "rijst", "potato", "aardappel",
        "tortilla", "wrap", "bread", "brood", "noodle",
    ],
    "dairy": [
        "cheese", "kaas", "yoghurt", "yogurt", "kwark", "cream", "room", "slagroom",
        "parmesan", "cheddar", "melk", "milk",
    ],
}


def _slug(text):
    clean = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return clean[:40] or "dinner"


def _classify(item):
    lower = item.lower()
    for category, patterns in CATEGORY_PATTERNS.items():
        if any(p in lower for p in patterns):
            return category
    return "other"


def _bucket_sale_items(sale_items):
    buckets = {key: [] for key in list(CATEGORY_PATTERNS) + ["other"]}
    for item in sale_items:
        buckets[_classify(item)].append(item)
    return buckets


def _savory_veg(buckets):
    return buckets["veg"] or [v for v in buckets["other"] if _classify(v) == "veg"]


def _pick(items, index=0):
    if not items:
        return None
    return items[index % len(items)]


def _title_parts(protein, veg, starch, other):
    parts = []
    if protein:
        parts.append(protein.split(",")[0].split(" of ")[0].strip())
    if veg:
        parts.append(veg.split(",")[0].strip())
    elif starch:
        parts.append(starch.split(",")[0].strip())
    elif other:
        parts.append(other.split(",")[0].strip())
    return parts


def _make_id(name, index):
    digest = hashlib.md5(f"{name}-{index}".encode()).hexdigest()[:8]
    return f"gen-{digest}"


def _recipe_base(name, description, time, sale_used, pantry_used, steps, index):
    all_ingredients = sale_used + pantry_used
    return {
        "id": _make_id(name, index),
        "name": name,
        "description": description,
        "time": time,
        "servings": 4,
        "tags": ["generated", "sale-based"],
        "ingredients": all_ingredients,
        "saleIngredients": sale_used,
        "pantryIngredients": pantry_used,
        "matchedIngredients": sale_used,
        "steps": steps,
    }


def _skillet_protein_recipe(protein, veg, index):
    sale_used = [protein]
    if veg:
        sale_used.append(veg)

    pantry = ["olive oil", "salt", "pepper", "garlic", "butter"]
    names = _title_parts(protein, veg, None, None)
    title = f"{' & '.join(names[:2])} Skillet Dinner" if len(names) > 1 else f"{names[0]} Skillet Dinner"

    veg_line = f"Add chopped {veg} and cook 6 to 8 minutes until tender-crisp." if veg else "Add any extra vegetables and cook 5 minutes until softened."

    steps = [
        f"Pat or slice the {protein} and season with salt, pepper, and paprika.",
        f"Heat olive oil in a large skillet over medium-high heat. Cook the {protein} until browned and cooked through.",
        "Remove to a plate. Melt butter in the same pan and sauté minced garlic for 30 seconds.",
        veg_line,
        f"Return the {protein} to the pan, toss everything together, and serve hot.",
    ]

    return _recipe_base(
        title,
        f"A quick one-pan dinner built around sale-item {protein}."
        + (f" Uses discounted {veg} too." if veg else ""),
        "30 min",
        sale_used,
        pantry,
        steps,
        index,
    )


def _pasta_sale_recipe(veg_items, protein, index):
    sale_used = list(veg_items[:3])
    if protein:
        sale_used.insert(0, protein)
    pantry = ["pasta", "olive oil", "garlic", "salt", "pepper", "parmesan"]

    veg_text = ", ".join(veg_items[:3]) if veg_items else "vegetables"
    title = f"Sale-Item Pasta with {veg_text.split(',')[0]}"

    steps = [
        "Cook pasta in salted boiling water until al dente. Reserve a cup of pasta water, then drain.",
        "Warm olive oil in a wide pan. Sauté minced garlic for 30 seconds.",
        f"Add {veg_text} and cook 5 minutes until softened.",
        *( [f"Add sliced {protein} and cook until done."] if protein else [] ),
        "Toss in the pasta with a splash of pasta water. Season with salt and pepper.",
        "Finish with grated parmesan and serve immediately.",
    ]

    return _recipe_base(
        title,
        "Creamy, simple pasta loaded with this week's sale produce.",
        "25 min",
        sale_used,
        pantry,
        steps,
        index,
    )


def _sheet_pan_recipe(protein, veg, index):
    sale_used = [protein]
    if veg:
        sale_used.append(veg)
    pantry = ["olive oil", "salt", "pepper", "garlic", "lemon"]

    steps = [
        "Preheat the oven to 220 degrees Celsius. Line a large baking tray with parchment.",
        f"Toss {veg or 'vegetables'} with olive oil, salt, and pepper. Spread on the tray.",
        f"Season the {protein} with garlic, salt, pepper, and a drizzle of olive oil. Place on the tray.",
        "Roast 15 to 20 minutes until the protein is cooked and vegetables are tender.",
        "Squeeze lemon over everything and serve.",
    ]

    names = _title_parts(protein, veg, None, None)
    title = f"Sheet Pan {' & '.join(names[:2])}"

    return _recipe_base(
        title,
        "Minimal cleanup dinner using sale proteins and vegetables.",
        "40 min",
        sale_used,
        pantry,
        steps,
        index,
    )


def _rice_bowl_recipe(protein, veg, index):
    sale_used = [protein]
    if veg:
        sale_used.append(veg)
    pantry = ["rice", "soy sauce", "vegetable oil", "garlic", "ginger", "salt", "pepper"]

    steps = [
        "Cook rice according to package directions.",
        f"Slice the {protein} and stir-fry in hot oil until cooked. Set aside.",
        f"Stir-fry {veg or 'vegetables'} with garlic and ginger for 4 minutes.",
        f"Return the {protein}, add a splash of soy sauce, and toss to coat.",
        "Serve over rice.",
    ]

    return _recipe_base(
        f"{protein.split(',')[0]} Rice Bowl",
        "Fast stir-fry bowl using sale ingredients.",
        "25 min",
        sale_used,
        pantry,
        steps,
        index,
    )


def _simple_sale_highlight(item, index):
    pantry = ["olive oil", "salt", "pepper", "garlic", "lemon", "butter"]
    steps = [
        f"Prepare the {item} — wash, trim, or slice as needed.",
        "Heat olive oil or butter in a pan over medium heat.",
        f"Cook the {item} until golden and done, seasoning with salt, pepper, and garlic.",
        "Finish with a squeeze of lemon and serve as a main or hearty side.",
    ]

    return _recipe_base(
        f"Simple {item.split(',')[0]} Supper",
        f"Let discounted {item} shine with pantry staples.",
        "20 min",
        [item],
        pantry,
        steps,
        index,
    )


def _vegetarian_bowl(veg_items, starch, index):
    sale_used = list(veg_items[:3])
    if starch:
        sale_used.append(starch)
    pantry = ["olive oil", "salt", "pepper", "garlic", "lemon"]

    base = starch or "rice (pantry)"
    veg_text = ", ".join(veg_items[:3])

    steps = [
        f"Cook {base} if needed and keep warm.",
        f"Sauté {veg_text} in olive oil with garlic until tender.",
        "Season with salt, pepper, and lemon juice.",
        "Serve the vegetables over the base.",
    ]

    return _recipe_base(
        f"Sale Veggie Bowl with {veg_items[0].split(',')[0]}",
        "Meat-free dinner from this week's produce deals.",
        "25 min",
        sale_used,
        pantry,
        steps,
        index,
    )


def generate_recipes_from_sales(sale_items, limit=3, deals=None):
    if not sale_items:
        return []

    from llm_recipes import generate_recipes_with_llm

    llm_recipes = generate_recipes_with_llm(sale_items, limit=limit, deals=deals)
    if llm_recipes:
        return llm_recipes

    return _generate_rule_based_recipes(sale_items, limit=limit, deals=deals)


def _generate_rule_based_recipes(sale_items, limit=3, deals=None):
    buckets = _bucket_sale_items(sale_items)
    proteins = buckets["protein"]
    vegs = _savory_veg(buckets)
    starches = buckets["starch"]
    fruits = buckets["fruit"]
    others = [x for x in buckets["other"] + buckets["dairy"] if x not in fruits]

    candidates = []

    if proteins and vegs:
        for i, protein in enumerate(proteins[:2]):
            veg = _pick(vegs, i)
            candidates.append(_skillet_protein_recipe(protein, veg, i))
        if _pick(proteins):
            candidates.append(_sheet_pan_recipe(_pick(proteins), _pick(vegs, 1), len(candidates)))
        if len(proteins) >= 1 and len(vegs) >= 1:
            candidates.append(_rice_bowl_recipe(_pick(proteins, 1), _pick(vegs, 2), len(candidates)))

    if vegs:
        candidates.append(_pasta_sale_recipe(vegs, _pick(proteins), len(candidates)))

    if vegs and not proteins:
        candidates.append(_vegetarian_bowl(vegs, _pick(starches), len(candidates)))

    if proteins and not vegs:
        candidates.append(_skillet_protein_recipe(_pick(proteins), None, len(candidates)))
        candidates.append(_sheet_pan_recipe(_pick(proteins), None, len(candidates) + 1))

    for item in fruits[:1]:
        candidates.append(_simple_sale_highlight(item, len(candidates)))

    for item in others[:1]:
        if item not in proteins + vegs + starches + fruits:
            candidates.append(_simple_sale_highlight(item, len(candidates)))

    # Fallback: at least one recipe from first sale item
    if not candidates and sale_items:
        candidates.append(_simple_sale_highlight(sale_items[0], 0))

    # Deduplicate by name
    seen = set()
    unique = []
    for recipe in candidates:
        if recipe["name"] in seen:
            continue
        seen.add(recipe["name"])
        savings = compute_recipe_savings(recipe["saleIngredients"], deals or [])
        unique.append(attach_measured_ingredients({**recipe, **savings}))

    return unique[:limit]


def get_generated_recipe_by_id(recipe_id, sale_items, deals=None):
    """Regenerate pool and find recipe by id."""
    for recipe in generate_recipes_from_sales(sale_items, limit=10, deals=deals):
        if recipe["id"] == recipe_id:
            return recipe
    return None
