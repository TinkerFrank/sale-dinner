#!/usr/bin/env python3
"""Fetch current Apify sales and update bundled cache files."""

import json
import os
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent


def load_env():
    for env_path in (BASE / ".env", BASE / "dinner" / ".env"):
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())
        break


def main():
    load_env()
    token = os.environ.get("APIFY_TOKEN", "")
    if not token:
        print("ERROR: APIFY_TOKEN not set", file=sys.stderr)
        sys.exit(1)

    from apify_client import fetch_local_sales

    print("Fetching latest Apify sales (Jumbo, on sale)...")
    result = fetch_local_sales(token, enrich_savings=True)
    print(f"Source: {result.get('source')}")
    print(f"Run: {result.get('runId')} dataset: {result.get('datasetId')}")
    print(f"Deals: {result.get('count')} ingredients: {result.get('ingredientCount')}")

    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    for path in (BASE / "sales_cache.json", BASE / "public" / "sales-cache.json"):
        path.write_text(payload, encoding="utf-8")
        print(f"Wrote {path.relative_to(BASE)}")


if __name__ == "__main__":
    main()
