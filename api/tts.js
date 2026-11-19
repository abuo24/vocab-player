// Vercel serverless function: turns a short text into natural-sounding speech (MP3).
// Used by Screen-off mode, which needs real audio files so playback continues with the phone locked.
// GET /api/tts?l=en|uz|tr|ru&t=TEXT   (max 200 characters)
// Uzbek falls back to Turkish when no Uzbek voice is available.

const LANGS = new Set(["en", "uz", "tr", "ru"]);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

module.exports = async (req, res) => {
  res.setHeader("X-Vocab", "1");
  const q = req.query || {};
  const text = String(q.t || "").replace(/\s+/g, " ").trim().slice(0, 200);
  let lang = String(q.l || "en");
  if (!text) return res.status(400).json({ error: "No text" });
  if (!LANGS.has(lang)) lang = "en";

  const order = lang === "uz" ? ["uz", "tr"] : [lang];
  for (const tl of order) {
    try {
      const url =
        "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" +
        tl +
        "&q=" +
        encodeURIComponent(text);
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Referer: "https://translate.google.com/" },
      });
      const type = r.headers.get("content-type") || "";
      if (!r.ok || !type.includes("audio")) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 400) continue;
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
      res.setHeader("X-Tts-Lang", tl);
      return res.status(200).send(buf);
    } catch (e) {
      // try the next language
    }
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(502).json({ error: "Speech service unavailable" });
};
