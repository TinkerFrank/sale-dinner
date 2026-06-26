#!/usr/bin/env python3
"""Sale Dinner Suggest — local server with ElevenLabs TTS."""

import json
import os
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from recipes import get_recipe_by_id, suggest_recipes
from apify_client import fetch_local_sales

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
SALES_CACHE_FILE = BASE_DIR / "sales_cache.json"
PORT = int(os.environ.get("PORT", "3000"))
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"
TTS_MODEL = "eleven_turbo_v2_5"


def load_env():
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_env()
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
APIFY_DATASET_ID = os.environ.get("APIFY_DATASET_ID", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        if self.path == "/api/health":
            return self.send_json(200, {
                "ok": True,
                "elevenlabsConfigured": bool(ELEVENLABS_API_KEY),
                "apifyConfigured": bool(APIFY_TOKEN),
                "llmConfigured": bool(OPENAI_API_KEY),
            })

        if self.path.startswith("/api/recipes/"):
            recipe_id = self.path.split("/api/recipes/", 1)[1].strip("/")
            recipe = get_recipe_by_id(recipe_id)
            if not recipe:
                return self.send_json(404, {"error": "Recipe not found"})
            return self.send_json(200, recipe)

        if self.path == "/api/voices":
            return self.handle_voices()

        if self.path == "/api/stored-sales":
            return self.handle_stored_sales()

        if self.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/suggest":
            return self.handle_suggest()
        if self.path == "/api/fetch-sales":
            return self.handle_fetch_sales()
        if self.path == "/api/speak":
            return self.handle_speak()
        self.send_json(404, {"error": "Not found"})

    def handle_suggest(self):
        try:
            body = self.read_json_body()
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "Invalid JSON"})

        sale_items = body.get("saleItems", "")
        limit = int(body.get("limit", 3))
        deals = body.get("deals") or []
        result = suggest_recipes(sale_items, limit, deals=deals)
        self.send_json(200, result)

    def handle_fetch_sales(self):
        if not APIFY_TOKEN:
            return self.send_json(500, {"error": "Apify token is not configured"})

        try:
            body = self.read_json_body()
        except json.JSONDecodeError:
            body = {}

        try:
            result = fetch_local_sales(
                APIFY_TOKEN,
                postal_code=(body.get("postalCode") or "").strip(),
                dataset_id=APIFY_DATASET_ID,
                enrich_savings=bool(body.get("enrichSavings", True)),
            )
            self.save_sales_cache(result)
            self.send_json(200, result)
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except RuntimeError as error:
            self.send_json(502, {"error": str(error)})
        except Exception as error:
            print(f"Fetch sales error: {error}")
            self.send_json(500, {"error": "Failed to fetch local sales"})

    def save_sales_cache(self, result):
        try:
            data = dict(result)
            data["cachedAt"] = time.strftime("%Y-%m-%d %H:%M:%S")
            SALES_CACHE_FILE.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"Sales opgeslagen in {SALES_CACHE_FILE.name}")
        except Exception as error:
            print(f"Kon sales niet opslaan: {error}")

    def handle_stored_sales(self):
        if not SALES_CACHE_FILE.exists():
            return self.send_json(404, {"error": "No stored sales yet. Reload from Apify first."})
        try:
            data = json.loads(SALES_CACHE_FILE.read_text(encoding="utf-8"))
            self.send_json(200, data)
        except Exception as error:
            print(f"Kon opgeslagen sales niet lezen: {error}")
            self.send_json(500, {"error": "Failed to read stored sales"})

    def handle_speak(self):
        if not ELEVENLABS_API_KEY:
            return self.send_json(500, {"error": "ElevenLabs API key is not configured"})

        try:
            body = self.read_json_body()
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "Invalid JSON"})

        text = (body.get("text") or "").strip()
        if not text:
            return self.send_json(400, {"error": "Text is required"})

        voice_id = body.get("voiceId") or DEFAULT_VOICE_ID
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
        payload = json.dumps({
            "text": text,
            "model_id": TTS_MODEL,
            "voice_settings": {
                "stability": 0.45,
                "similarity_boost": 0.8,
                "style": 0.2,
                "use_speaker_boost": True
            }
        }).encode("utf-8")

        request = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "xi-api-key": ELEVENLABS_API_KEY,
                "Accept": "audio/mpeg"
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                audio = response.read()
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            print(f"ElevenLabs error: {error.code} {details}")
            return self.send_json(error.code, {
                "error": "ElevenLabs request failed",
                "details": details
            })
        except urllib.error.URLError as error:
            print(f"TTS network error: {error}")
            return self.send_json(500, {"error": "Failed to reach ElevenLabs"})

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("Cache-Control", "private, max-age=3600")
        self.end_headers()
        self.wfile.write(audio)

    def handle_voices(self):
        if not ELEVENLABS_API_KEY:
            return self.send_json(500, {"error": "ElevenLabs API key is not configured"})

        request = urllib.request.Request(
            "https://api.elevenlabs.io/v1/voices",
            headers={"xi-api-key": ELEVENLABS_API_KEY}
        )

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            return self.send_json(error.code, {"error": details})
        except urllib.error.URLError:
            return self.send_json(500, {"error": "Failed to fetch voices"})

        voices = [
            {"id": v.get("voice_id"), "name": v.get("name"), "category": v.get("category")}
            for v in data.get("voices", [])
        ]
        self.send_json(200, {"voices": voices})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Sale Dinner Suggest running at http://localhost:{PORT}")
    if not ELEVENLABS_API_KEY:
        print("Warning: ELEVENLABS_API_KEY is not set. Audio will not work.")
    if not APIFY_TOKEN:
        print("Warning: APIFY_TOKEN is not set. Sale fetching will not work.")
    if not OPENAI_API_KEY:
        print("Warning: OPENAI_API_KEY is not set. Using rule-based recipe generator.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
