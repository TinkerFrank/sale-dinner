# Sale Dinner

A web app that loads grocery sale items from Apify, generates custom dinner recipes, and reads step-by-step cooking instructions aloud via ElevenLabs.

## Quick start (Python — recommended)

```powershell
py server.py
```

On Windows, use `py` if `python` is not recognized. You can also double-click `start.bat`.

Open **http://localhost:3000**

## Alternative (Node.js)

```powershell
npm install
npm start
```

## Setup

1. Copy `.env.example` to `.env`
2. Add your API keys:

```
ELEVENLABS_API_KEY=your_key_here
APIFY_TOKEN=your_apify_token_here
APIFY_ACTOR_ID=harvestedge~dutch-supermarkets-all-11
```

Keys are only used on the server — never sent to the browser.

## Deploy on Vercel

1. Import this repo in Vercel
2. Leave **Root Directory** empty (project root)
3. Add environment variables: `ELEVENLABS_API_KEY`, `APIFY_TOKEN`, optional `APIFY_ACTOR_ID`
4. Deploy — `vercel.json` routes all traffic to the Express API + static frontend

## Features

- Load Jumbo sale deals from Apify (Dutch Supermarkets actor)
- Demo sales fallback when Apify is unavailable
- Recipe suggestions from sale items + pantry staples
- Guided cook-along with voice (“next” / “done”) and ElevenLabs TTS
