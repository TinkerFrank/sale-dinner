"""Scrape savings details from Jumbo aanbiedingen pages."""

import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
}


def promotion_id_from_url(url):
    if not url:
        return None
    match = re.search(r"/(\d+)/?$", url.rstrip("/"))
    return match.group(1) if match else None


def _fetch_html(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def _parse_nuxt_payload(html):
    match = re.search(r'id="__NUXT_DATA__">(.*?)</script>', html, re.S)
    return match.group(1) if match else ""


def _cents_to_eur(value):
    if value is None:
        return None
    return round(value / 100, 2)


def scrape_jumbo_deal(url, fallback_name=None):
    promotion_id = promotion_id_from_url(url)
    if not promotion_id:
        return {
            "url": url,
            "name": fallback_name,
            "promotionTag": None,
            "salePriceEur": None,
            "pricePerUnitEur": None,
            "pricePerUnitLabel": None,
            "savingsText": None,
            "error": "Invalid URL",
        }

    try:
        html = _fetch_html(url)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
        return {
            "url": url,
            "name": fallback_name,
            "promotionId": promotion_id,
            "promotionTag": None,
            "salePriceEur": None,
            "pricePerUnitEur": None,
            "pricePerUnitLabel": None,
            "savingsText": None,
            "error": str(error),
        }

    payload = _parse_nuxt_payload(html)
    title = fallback_name
    promotion_tag = None
    sale_price = None
    price_per_unit = None
    unit_label = None

    if payload:
        title_match = re.search(rf'"{promotion_id}","([^"]+)"', payload)
        if title_match:
            title = title_match.group(1)

        tag_match = re.search(
            rf'"{promotion_id}","[^"]+".{{0,800}}?"PromotionTag","([^"]+)"',
            payload,
            re.S,
        )
        if tag_match:
            promotion_tag = tag_match.group(1)

        window = payload
        id_idx = payload.find(f'"{promotion_id}"')
        if id_idx >= 0:
            window = payload[id_idx:id_idx + 4000]

        price_match = re.search(r'"Price",(\d+)', window)
        if price_match:
            sale_price = _cents_to_eur(int(price_match.group(1)))

        ppu_match = re.search(
            r'"PricePerUnit",(\d+),"([^"]+)"',
            window,
        )
        if ppu_match:
            price_per_unit = _cents_to_eur(int(ppu_match.group(1)))
            unit_label = ppu_match.group(2)

    savings_text = promotion_tag
    if not savings_text and sale_price is not None:
        savings_text = f"€{sale_price:.2f}".replace(".", ",")
        if price_per_unit is not None and unit_label:
            savings_text += f" ({price_per_unit:.2f}/{unit_label})".replace(".", ",")

    return {
        "url": url,
        "name": title or fallback_name,
        "promotionId": promotion_id,
        "promotionTag": promotion_tag,
        "salePriceEur": sale_price,
        "pricePerUnitEur": price_per_unit,
        "pricePerUnitLabel": unit_label,
        "savingsText": savings_text,
        "error": None,
    }


def enrich_deals_with_savings(deals, max_workers=6, limit=None):
    targets = deals[:limit] if limit else deals
    enriched = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(scrape_jumbo_deal, deal.get("url"), deal.get("name")): deal
            for deal in targets
            if deal.get("url")
        }

        for future in as_completed(futures):
            original = futures[future]
            try:
                scraped = future.result()
            except Exception as error:
                scraped = {
                    "url": original.get("url"),
                    "name": original.get("name"),
                    "savingsText": None,
                    "error": str(error),
                }

            enriched.append({
                **original,
                **scraped,
                "ingredients": original.get("ingredients", []),
            })

    enriched.sort(key=lambda item: (item.get("name") or "").lower())
    return enriched
