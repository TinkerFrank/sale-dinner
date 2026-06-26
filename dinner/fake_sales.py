"""Demo Jumbo sale data — used when Apify token is missing or unavailable."""

JUMBO_VIEW = "https://www.jumbo.com/aanbiedingen"

FAKE_DEALS = [
    {"name": "Campina, Optimel en Vifit", "savingsText": "30% korting", "ingredients": ["cheese", "cream"], "url": JUMBO_VIEW},
    {"name": "Chocomel, Fristi, Friesche Vlag en Campina Slagroom", "savingsText": "30% korting", "ingredients": ["cream"], "url": JUMBO_VIEW},
    {"name": "Cocktail trostomaten", "savingsText": "voor €1,99", "ingredients": ["tomatoes"], "url": JUMBO_VIEW},
    {"name": "Danio kwark", "savingsText": "2 voor €4,00", "ingredients": ["cheese"], "url": JUMBO_VIEW},
    {"name": "Fijnproevers IJslands gerookte zalm", "savingsText": "1+1 gratis", "ingredients": ["salmon"], "url": JUMBO_VIEW},
    {"name": "Kipfilet", "savingsText": "€5,99/kg", "ingredients": ["chicken"], "url": JUMBO_VIEW},
    {"name": "Broccoli", "savingsText": "voor €0,99", "ingredients": ["broccoli"], "url": JUMBO_VIEW},
    {"name": "Gehakt half-om-half", "savingsText": "30% korting", "ingredients": ["beef"], "url": JUMBO_VIEW},
    {"name": "Penne pasta", "savingsText": "2 voor €3,00", "ingredients": ["pasta"], "url": JUMBO_VIEW},
    {"name": "Knoflook", "savingsText": "voor €0,79", "ingredients": ["garlic"], "url": JUMBO_VIEW},
    {"name": "Roomboter", "savingsText": "25% korting", "ingredients": ["butter"], "url": JUMBO_VIEW},
    {"name": "Citroenen", "savingsText": "4 stuks €1,99", "ingredients": ["lemon"], "url": JUMBO_VIEW},
    {"name": "Courgette", "savingsText": "voor €0,89", "ingredients": ["zucchini"], "url": JUMBO_VIEW},
    {"name": "Paprika mix", "savingsText": "2 voor €2,50", "ingredients": ["bell pepper"], "url": JUMBO_VIEW},
    {"name": "Zalmfilet", "savingsText": "1+1 gratis", "ingredients": ["salmon"], "url": JUMBO_VIEW},
    {"name": "Aardappelen", "savingsText": "5 kg voor €3,99", "ingredients": ["potatoes"], "url": JUMBO_VIEW},
    {"name": "Asperges", "savingsText": "voor €2,49", "ingredients": ["asparagus"], "url": JUMBO_VIEW},
    {"name": "Garnalen", "savingsText": "30% korting", "ingredients": ["shrimp"], "url": JUMBO_VIEW},
    {"name": "Tortilla wraps", "savingsText": "2 voor €3,00", "ingredients": ["tortillas"], "url": JUMBO_VIEW},
    {"name": "Iceberg sla", "savingsText": "voor €0,99", "ingredients": ["lettuce"], "url": JUMBO_VIEW},
    {"name": "Old Amsterdam kaas", "savingsText": "25% korting", "ingredients": ["cheddar", "cheese"], "url": JUMBO_VIEW},
    {"name": "Rijst basmati", "savingsText": "voor €2,29", "ingredients": ["rice"], "url": JUMBO_VIEW},
    {"name": "Spinazie", "savingsText": "2 voor €3,00", "ingredients": ["spinach"], "url": JUMBO_VIEW},
    {"name": "Varkenshaas", "savingsText": "€6,99/kg", "ingredients": ["pork"], "url": JUMBO_VIEW},
    {"name": "Appels Jonagold", "savingsText": "voor €1,79/kg", "ingredients": ["apples"], "url": JUMBO_VIEW},
    {"name": "Champignons", "savingsText": "voor €1,49", "ingredients": ["mushrooms"], "url": JUMBO_VIEW},
    {"name": "Wortelen", "savingsText": "1 kg voor €0,99", "ingredients": ["carrots"], "url": JUMBO_VIEW},
    {"name": "Kidneybonen", "savingsText": "2 voor €2,00", "ingredients": ["beans"], "url": JUMBO_VIEW},
    {"name": "Maïs blik", "savingsText": "3 voor €2,50", "ingredients": ["corn"], "url": JUMBO_VIEW},
    {"name": "Ui", "savingsText": "1 kg voor €0,89", "ingredients": ["onion"], "url": JUMBO_VIEW},
]


def build_fake_sales_response():
    sale_items = []
    seen = set()

    for deal in FAKE_DEALS:
        for ingredient in deal["ingredients"]:
            key = ingredient.lower()
            if key not in seen:
                seen.add(key)
                sale_items.append(ingredient)

    deals = []
    for deal in FAKE_DEALS:
        deals.append({
            **deal,
            "supermarket": "Jumbo",
            "promotionTag": deal["savingsText"],
            "estimated": "~" in deal.get("savingsText", ""),
        })

    return {
        "source": "demo-jumbo",
        "demo": True,
        "supermarket": "Jumbo",
        "datasetId": "demo",
        "saleItems": sale_items,
        "deals": deals,
        "count": len(deals),
        "ingredientCount": len(sale_items),
    }
