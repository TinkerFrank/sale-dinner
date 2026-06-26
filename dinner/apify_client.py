"""Fetch grocery sales via Apify actor or pre-scraped dataset."""

import json
import re
import time
import urllib.error
import urllib.request

from jumbo_scraper import enrich_deals_with_savings

APIFY_BASE = "https://api.apify.com/v2"
ACTOR_ID = "studio-amba~jumbo-scraper"
# Dutch product keywords → English ingredients for recipe matching
DUTCH_TO_INGREDIENT = [
    (r"\bzalm\b", "salmon"),
    (r"\bkip\b", "chicken"),
    (r"\bvarkens\b|\bbeenham\b|\bham\b", "pork"),
    (r"\brund\b|\bgehakt\b|\bbief\b", "beef"),
    (r"\bgarnalen\b|\bscampi\b", "shrimp"),
    (r"\bbroccoli\b", "broccoli"),
    (r"\btomaat", "tomatoes"),
    (r"\bpaprika\b", "bell pepper"),
    (r"\bappel", "apples"),
    (r"\baardbei", "strawberries"),
    (r"\bavocado\b", "avocado"),
    (r"\bui\b|\buien\b", "onion"),
    (r"\bknoflook\b", "garlic"),
    (r"\bpasta\b|\bspaghetti\b|\bpenne\b", "pasta"),
    (r"\brijst\b", "rice"),
    (r"\bkaas\b|\bcheddar\b|\bkwark\b|\byoghurt\b", "cheese"),
    (r"\broom\b|\bslagroom\b", "cream"),
    (r"\bbonen\b|\bkidney\b", "beans"),
    (r"\bmais\b", "corn"),
    (r"\bspinazie\b|\bsla\b", "spinach"),
    (r"\basperge", "asparagus"),
    (r"\bperen\b|\bperzik", "peaches"),
    (r"\bkomkommer\b", "cucumber"),
    (r"\bwortel", "carrots"),
    (r"\bchampignon", "mushrooms"),
    (r"\bpompoen\b", "pumpkin"),
    (r"\bcitroen\b|\blemon\b", "lemon"),
    (r"\bvis\b|\btilapia\b|\bkabeljauw\b", "fish"),
    (r"\btortilla\b", "tortillas"),
    (r"\bwrap\b", "tortillas"),
]


def _extract_item_name(record):
    if not isinstance(record, dict):
        return None
    for key in ("name", "title", "itemName", "productName", "item"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def dutch_name_to_ingredients(name):
    """Map a Dutch sale product name to English ingredient keywords."""
    lowered = name.lower()
    found = []

    for pattern, ingredient in DUTCH_TO_INGREDIENT:
        if re.search(pattern, lowered):
            found.append(ingredient)

    if found:
        return list(dict.fromkeys(found))

    # Fall back to the original name for partial matching
    return [name]


def fetch_dataset_sales(token, dataset_id, limit=500, enrich_savings=False):
    if not token:
        raise ValueError("Apify token is not configured")
    if not dataset_id:
        raise ValueError("Apify dataset ID is not configured")

    url = f"{APIFY_BASE}/datasets/{dataset_id}/items?token={token}&limit={limit}"

    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Apify dataset error ({error.code}): {details}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Apify: {error.reason}") from error

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Apify dataset response")

    deals = []
    sale_items = []
    seen_ingredients = set()
    seen_names = set()
    supermarket = None

    for record in data:
        name = _extract_item_name(record)
        if not name:
            continue

        name_key = name.lower()
        if name_key in seen_names:
            continue
        seen_names.add(name_key)

        store = record.get("supermarket") or record.get("merchant") or record.get("store")
        if store and not supermarket:
            supermarket = store

        ingredients = dutch_name_to_ingredients(name)
        for ingredient in ingredients:
            key = ingredient.lower()
            if key not in seen_ingredients:
                seen_ingredients.add(key)
                sale_items.append(ingredient)

        deals.append({
            "name": name,
            "ingredients": ingredients,
            "supermarket": store,
            "price": record.get("price_eur") or record.get("price") or record.get("salePrice"),
            "discount": record.get("discount"),
            "url": record.get("url"),
        })

    if enrich_savings and deals:
        deals = enrich_deals_with_savings(deals)

    if not sale_items:
        raise RuntimeError("No sale items found in the Apify dataset")

    return {
        "source": "apify-dataset",
        "datasetId": dataset_id,
        "supermarket": supermarket,
        "saleItems": sale_items,
        "deals": deals,
        "count": len(deals),
        "ingredientCount": len(sale_items),
    }


def run_actor_and_fetch(token, actor_id=ACTOR_ID, input_data=None, enrich_savings=False, timeout=300):
    """Run an Apify actor, wait for it to finish, and return the results."""
    if not token:
        raise ValueError("Apify token is not configured")

    # Start the actor run
    run_url = f"{APIFY_BASE}/acts/{actor_id}/runs?token={token}"
    payload = json.dumps(input_data or {}).encode("utf-8")
    request = urllib.request.Request(
        run_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            run_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Apify actor start error ({error.code}): {details}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Apify: {error.reason}") from error

    run_id = run_data["data"]["id"]
    dataset_id = run_data["data"]["defaultDatasetId"]
    print(f"Actor run gestart: {run_id}")

    # Poll until the run is finished
    status_url = f"{APIFY_BASE}/actor-runs/{run_id}?token={token}"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(status_url, timeout=15) as response:
                status_data = json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as error:
            raise RuntimeError(f"Could not reach Apify: {error.reason}") from error

        status = status_data["data"]["status"]
        print(f"Actor status: {status}")
        if status == "SUCCEEDED":
            break
        if status in ("FAILED", "ABORTED", "TIMED-OUT"):
            raise RuntimeError(f"Actor run mislukt met status: {status}")
        time.sleep(5)
    else:
        raise RuntimeError("Actor run time-out na {timeout} seconden")

    return fetch_dataset_sales(token, dataset_id, enrich_savings=enrich_savings)


def fetch_local_sales(token, postal_code=None, dataset_id=None, enrich_savings=False, **_kwargs):
    """Run the Jumbo scraper actor live and return the results."""
    return run_actor_and_fetch(token, actor_id=ACTOR_ID, enrich_savings=enrich_savings)