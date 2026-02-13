# hime ⚡

AI-native IME Chrome extension — type English, get Japanese (or any language) output inline.

## Features

- **Compose Mode** — `Ctrl+Shift+T` to toggle. Type naturally in English, hit the hotkey again to convert to Japanese.
- **YOLO Mode** — `Ctrl+Shift+Y` to translate your entire input field in one shot.
- **Language Swap** — `Ctrl+Shift+S` to swap translation direction.
- **Multi-Provider** — OpenAI (GPT-5 mini/nano) or Google Gemini (2.5 Flash).
- **Formality Control** — Auto-detects tone, with manual override (casual/polite/formal).
- **Undo Support** — `Ctrl+Z` works on all translations.

## Installation

### Developer Mode (Current)

1. Clone/download this repo
2. Run `npm install && npm run build`
3. Open Chrome → Extensions → Developer mode ON
4. Click "Load unpacked" → select the `dist` folder
5. Click the hime icon → Settings → add your API key

### Chrome Web Store

Coming soon — waiting for v1 stability.

## Setup

1. Get an API key from [OpenAI](https://platform.openai.com) or [Google AI Studio](https://aistudio.google.com)
2. Open hime settings (right-click icon → Options)
3. Select your provider and paste your API key
4. Test the connection
5. Save

## Hotkeys

All hotkeys work when focused in any text field:

| Hotkey | Action |
|--------|--------|
| `Ctrl+Shift+T` | Toggle compose mode |
| `Ctrl+Shift+Y` | YOLO translate (entire field) |
| `Ctrl+Shift+S` | Swap language direction |
| `Escape` | Cancel compose mode |
| `Ctrl+Z` | Undo translation |

Hotkeys can be customized at `chrome://extensions/shortcuts`

## Usage

### Compose Mode

1. Focus any text field (works on `<input>`, `<textarea>`, `contenteditable`)
2. Press `Ctrl+Shift+T` — field gets blue border, badge shows "ON"
3. Type in English naturally
4. Press `Ctrl+Shift+T` again — text converts to Japanese
5. `Escape` cancels without translating

### YOLO Mode

1. Focus any text field with content
2. Press `Ctrl+Shift+Y` — entire field is translated instantly

## Tech Stack

- TypeScript
- Chrome Extension Manifest V3
- OpenAI / Google Gemini APIs (direct, no backend)

## License

MIT
