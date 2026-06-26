"""Fetch grocery sales via Apify actor or pre-scraped dataset."""

import json
import re
import time
import urllib.error
import urllib.request

from jumbo_scraper import enrich_deals_with_savings

APIFY_BASE = "https://api.apify.com/v2"
ACTOR_ID = "harvestedge~dutch-supermarkets-all-11"

# Default input when starting a fresh actor run (Jumbo dinner staples).
DEFAULT_ACTOR_INPUT = {
    "keyterms": [
        "kip", "varkens", "gehakt", "zalm", "vis", "garnalen",
        "broccoli", "tomaten", "paprika", "ui", "knoflook", "aardappel",
        "pasta", "rijst", "kaas", "room", "boter", "melk", "eieren",
        "spinazie", "champignons", "courgette", "asperges", "sla",
    ],
    "supermarkets": ["jumbo"],
    "maxResults": 500,
    "throttleDelay": 700,
}
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


def _has_discount(record):
    discount = record.get("discount")
    if discount is None:
        return False
    if isinstance(discount, str):
        return bool(discount.strip())
    return bool(discount)


def _apify_request(url, method="GET", payload=None, timeout=60):
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Apify error ({error.code}): {details}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Apify: {error.reason}") from error


def get_latest_successful_run(token, actor_id=ACTOR_ID):
    """Return the most recent SUCCEEDED run for an actor (GET .../runs)."""
    url = (
        f"{APIFY_BASE}/acts/{actor_id}/runs"
        f"?token={token}&status=SUCCEEDED&limit=1&desc=1"
    )
    data = _apify_request(url, timeout=30)
    items = (data.get("data") or {}).get("items") or []
    return items[0] if items else None


def fetch_dataset_sales(
    token,
    dataset_id,
    limit=500,
    enrich_savings=False,
    on_sale_only=False,
    supermarket_filter=None,
):
    if not token:
        raise ValueError("Apify token is not configured")
    if not dataset_id:
        raise ValueError("Apify dataset ID is not configured")

    url = f"{APIFY_BASE}/datasets/{dataset_id}/items?token={token}&limit={limit}"

    data = _apify_request(url)
    if not isinstance(data, list):
        raise RuntimeError("Unexpected Apify dataset response")

    deals = []
    sale_items = []
    seen_ingredients = set()
    seen_names = set()
    supermarket = None

    for record in data:
        if on_sale_only and not _has_discount(record):
            continue

        store = record.get("supermarket") or record.get("merchant") or record.get("store")
        if supermarket_filter:
            store_text = f"{store or ''} {record.get('url') or ''}".lower()
            if supermarket_filter.lower() not in store_text:
                continue

        name = _extract_item_name(record)
        if not name:
            continue

        name_key = name.lower()
        if name_key in seen_names:
            continue
        seen_names.add(name_key)

        if store and not supermarket:
            supermarket = store

        ingredients = dutch_name_to_ingredients(name)
        for ingredient in ingredients:
            key = ingredient.lower()
            if key not in seen_ingredients:
                seen_ingredients.add(key)
                sale_items.append(ingredient)

        discount = record.get("discount")
        savings_text = None
        if _has_discount(record):
            if isinstance(discount, (int, float)):
                savings_text = f"Was €{discount:.2f}".replace(".", ",")
            else:
                savings_text = f"Was {discount}"

        deals.append({
            "name": name,
            "ingredients": ingredients,
            "supermarket": store,
            "price": record.get("price_eur") or record.get("price") or record.get("salePrice"),
            "discount": discount,
            "url": record.get("url"),
            "unitSize": record.get("unit_size"),
            "savingsText": savings_text,
            "promotionTag": savings_text,
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


def run_actor_and_fetch(
    token,
    actor_id=ACTOR_ID,
    input_data=None,
    enrich_savings=False,
    timeout=900,
    on_sale_only=True,
):
    """Run an Apify actor, wait for it to finish, and return the results."""
    if not token:
        raise ValueError("Apify token is not configured")

    run_url = f"{APIFY_BASE}/acts/{actor_id}/runs?token={token}"
    run_data = _apify_request(
        run_url,
        method="POST",
        payload=input_data or DEFAULT_ACTOR_INPUT,
        timeout=30,
    )

    run_id = run_data["data"]["id"]
    dataset_id = run_data["data"]["defaultDatasetId"]
    print(f"Actor run started: {run_id}")

    status_url = f"{APIFY_BASE}/actor-runs/{run_id}?token={token}"
    deadline = time.time() + timeout
    while time.time() < deadline:
        status_data = _apify_request(status_url, timeout=15)
        status = status_data["data"]["status"]
        print(f"Actor status: {status}")
        if status == "SUCCEEDED":
            break
        if status in ("FAILED", "ABORTED", "TIMED-OUT"):
            raise RuntimeError(f"Actor run failed with status: {status}")
        time.sleep(5)
    else:
        raise RuntimeError(f"Actor run timed out after {timeout} seconds")

    result = fetch_dataset_sales(
        token,
        dataset_id,
        enrich_savings=enrich_savings,
        on_sale_only=on_sale_only,
        supermarket_filter="jumbo",
    )
    result.update({
        "source": "apify-actor-run",
        "actorId": actor_id,
        "runId": run_id,
        "datasetId": dataset_id,
    })
    return result


def fetch_local_sales(
    token,
    postal_code=None,
    dataset_id=None,
    enrich_savings=False,
    actor_id=None,
    start_new_run=False,
    **_kwargs,
):
    """Load sales from the Dutch Supermarkets actor (latest run or fresh scrape)."""
    actor_id = actor_id or ACTOR_ID
    if not token:
        raise ValueError("Apify token is not configured")

    if dataset_id:
        result = fetch_dataset_sales(token, dataset_id, enrich_savings=enrich_savings)
        result["source"] = "apify-dataset"
        result["datasetId"] = dataset_id
        return result

    if start_new_run:
        return run_actor_and_fetch(
            token,
            actor_id=actor_id,
            enrich_savings=enrich_savings,
        )

    latest_run = get_latest_successful_run(token, actor_id)
    if latest_run and latest_run.get("defaultDatasetId"):
        result = fetch_dataset_sales(
            token,
            latest_run["defaultDatasetId"],
            enrich_savings=enrich_savings,
            on_sale_only=True,
            supermarket_filter="jumbo",
        )
        result.update({
            "source": "apify-actor-run",
            "actorId": actor_id,
            "runId": latest_run.get("id"),
            "datasetId": latest_run.get("defaultDatasetId"),
        })
        if result.get("saleItems"):
            return result
        print("Latest actor run had no discounted Jumbo items — starting a fresh run")

    return run_actor_and_fetch(token, actor_id=actor_id, enrich_savings=enrich_savings)