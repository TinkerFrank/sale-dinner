# Sale Dinner

A web app that loads grocery sale items from Apify, generates custom dinner recipes (GPT or rule-based fallback), and reads step-by-step cooking instructions aloud via ElevenLabs.

## Quick start

```powershell
cd dinner
py server.py
```

Open **http://localhost:3000**

See [dinner/README.md](dinner/README.md) for full setup (Apify, ElevenLabs, OpenAI keys).

## Features

- Load Jumbo sale deals from your Apify dataset
- Scrape live promo prices from Jumbo product pages
- AI-generated recipes from sale items (OpenAI) with rule-based fallback
- Total savings per recipe
- Audible step-by-step instructions (ElevenLabs TTS)

## Project layout

| Path | Description |
|------|-------------|
| `dinner/` | Main Sale Dinner app (Python server + frontend) |
| `index.html`, `game.js` | Conway's Game of Life (original workspace) |

## test

<img width="707" height="527" alt="image" src="https://github.com/user-attachments/assets/b1a07845-5ca7-4fb5-ac0a-f5c3c774b6a2" />
<img width="702" height="881" alt="image" src="https://github.com/user-attachments/assets/0a87b048-5fb9-429a-9e70-9085830e5cc9" />

