"""Parse and sum savings from Jumbo deals for recipe suggestions."""

import re

from recipes import ingredient_matches_sale, normalize


def _parse_euro_amount(text):
    if not text:
        return None
    match = re.search(r"(\d+[.,]\d{2})", text)
    if not match:
        return None
    return float(match.group(1).replace(",", "."))


def _promo_price_from_deal(deal):
    text = (deal.get("savingsText") or deal.get("promotionTag") or "").strip()
    price = deal.get("salePriceEur") or deal.get("pricePerUnitEur")
    if price is not None:
        return float(price)

    if not text:
        return None

    bundle = re.search(r"2\s+voor\s+(\d+[.,]\d{2})", text, re.I)
    if bundle:
        return round(_parse_euro_amount(bundle.group(0)) / 2, 2)

    single = re.search(r"voor\s+(\d+[.,]\d{2})", text, re.I)
    if single:
        return _parse_euro_amount(single.group(0))

    per_kilo = re.search(r"(\d+[.,]\d{2})\s*per\s+kilo", text, re.I)
    if per_kilo:
        return _parse_euro_amount(per_kilo.group(0))

    return None


def estimate_deal_savings_eur(deal):
    text = (deal.get("savingsText") or deal.get("promotionTag") or "").strip()
    if not text:
        return None, False

    if re.search(r"korting", text, re.I):
        amount = _parse_euro_amount(text)
        return amount, False

    promo_price = _promo_price_from_deal(deal)

    if re.search(r"1\s*\+\s*1", text, re.I):
        if promo_price is not None:
            return promo_price, False
        return None, False

    if promo_price is not None:
        # Estimate ~30% off typical shelf price when only promo price is known.
        return round(promo_price * 0.30, 2), True

    sale = deal.get("salePriceEur")
    was = deal.get("wasPriceEur")
    if sale is not None and was is not None and was > sale:
        return round(was - sale, 2), False

    return None, False


def deal_matches_recipe(deal, matched_ingredients):
    if not matched_ingredients:
        return False

    deal_ingredients = deal.get("ingredients") or []
    deal_name = deal.get("name") or ""

    for ingredient in matched_ingredients:
        norm_ing = normalize(ingredient)
        for deal_ing in deal_ingredients:
            norm_deal = normalize(deal_ing)
            if norm_ing == norm_deal or norm_ing in norm_deal or norm_deal in norm_ing:
                return True
        if ingredient_matches_sale(deal_name, [ingredient]):
            return True

    return False


def compute_recipe_savings(matched_ingredients, deals):
    if not deals:
        return {
            "matchedDeals": [],
            "totalSavingsEur": None,
            "estimatedSavings": False,
            "quantifiedDealCount": 0,
            "dealCount": 0,
            "savingsLabel": None,
        }

    matched_deals = []
    seen_urls = set()
    total = 0.0
    quantified = 0
    any_estimated = False

    for deal in deals:
        url = deal.get("url")
        if url and url in seen_urls:
            continue
        if not deal_matches_recipe(deal, matched_ingredients):
            continue
        if url:
            seen_urls.add(url)

        savings_eur, estimated = estimate_deal_savings_eur(deal)
        savings_text = deal.get("savingsText") or deal.get("promotionTag")

        matched_deals.append({
            "name": deal.get("name"),
            "savingsText": savings_text,
            "url": url,
            "savingsEur": savings_eur,
            "estimated": estimated,
        })

        if savings_eur is not None:
            total += savings_eur
            quantified += 1
            if estimated:
                any_estimated = True

    total_savings = round(total, 2) if total > 0 else None
    savings_label = None
    if total_savings is not None:
        prefix = "Est. " if any_estimated else ""
        savings_label = f"{prefix}€{total_savings:.2f}".replace(".", ",")
    elif matched_deals:
        savings_label = f"{len(matched_deals)} deal{'s' if len(matched_deals) != 1 else ''} on sale"

    return {
        "matchedDeals": matched_deals,
        "totalSavingsEur": total_savings,
        "estimatedSavings": any_estimated,
        "quantifiedDealCount": quantified,
        "dealCount": len(matched_deals),
        "savingsLabel": savings_label,
    }
