# Vocab Player

Listen to your English-Uzbek vocabulary like a music playlist. It reads each word and its meaning aloud, on your phone or computer.

## Features

- Loads every tab of your Google Sheet (books) and its "Unit" rows (units)
- Modes: all words, latest unit of every book, last 3 units of every book, one book
- EN -> UZ or UZ -> EN, quiz mode, shuffle, repeat, speed, sleep timer
- Star hard words, mark known words, play only the ones you're still learning
- Screen-off mode on iPhone, so it can keep playing when the phone is locked
- Add to Home Screen to use it like an app

## Deploy on Vercel

1. Push this folder to a GitHub repository.
2. Go to <https://vercel.com/new>, import the repository and click **Deploy**. No build settings are needed.
3. In Google Sheets, open your sheet -> **Share** -> **General access** -> **Anyone with the link** (Viewer).
4. Open your Vercel URL. It loads the sheet automatically. Tap the sync button to sync after you add words.

Optional: in Vercel -> Project -> Settings -> Environment Variables, set `SHEET_IDS` to your sheet ID so the `/api/sheet` endpoint only serves your own sheet.

## iPhone

Open the site in Safari -> **Share** -> **Add to Home Screen**. For playback with the screen locked, turn on **Screen-off**. If the iPhone voice stops when locked, choose an **Offline voice** in Settings: it plays as a real audio track.

## Files

- `index.html`: the whole app
- `api/sheet.js`: downloads your Google Sheet as .xlsx for the app
- `manifest.json`, `icons/`: home screen app setup
