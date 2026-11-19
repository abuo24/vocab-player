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
  if (q.ping) return res.status(200).json({ ok: true, node: process.version });
  if (!text) return res.status(400).json({ error: "No text" });
  if (!LANGS.has(lang)) lang = "en";

  const order = lang === "uz" ? ["uz", "tr"] : [lang];
  const debug = [];
  for (const tl of order) {
    try {
      const url =
        "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" +
        tl +
        "&q=" +
        encodeURIComponent(text);
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Referer: "https://translate.google.com/" },
        signal: AbortSignal.timeout(4000),
      });
      const type = r.headers.get("content-type") || "";
      const buf = Buffer.from(await r.arrayBuffer());
      debug.push({ tl, status: r.status, type, bytes: buf.length });
      if (!r.ok || !type.includes("audio") || buf.length < 400) continue;
      if (q.debug) return res.status(200).json({ ok: true, debug });
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
      res.setHeader("X-Tts-Lang", tl);
      return res.status(200).send(buf);
    } catch (e) {
      debug.push({ tl, error: String(e && e.message || e) });
    }
  }
  res.setHeader("Cache-Control", "no-store");
  if (q.debug) return res.status(200).json({ ok: false, debug });
  return res.status(502).json({ error: "Speech service unavailable" });
};
