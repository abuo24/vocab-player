// Vercel serverless function: turns a short text into natural-sounding speech (MP3).
// Used by Screen-off mode, which needs real audio files so playback continues with the phone locked.
// GET /api/tts?l=en|uz|tr|ru&t=TEXT   (max 200 characters)
// Uzbek falls back to Turkish when no Uzbek voice is available.

const https = require("https");

const LANGS = new Set(["en", "uz", "tr", "ru"]);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function get(url, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const req = https.get(
        url,
        { headers: { "User-Agent": UA, Referer: "https://translate.google.com/" } },
        (r) => {
          const chunks = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () =>
            finish({ status: r.statusCode, type: r.headers["content-type"] || "", body: Buffer.concat(chunks) })
          );
          r.on("error", (e) => finish({ error: String(e.message || e) }));
        }
      );
      req.on("error", (e) => finish({ error: String(e.message || e) }));
      req.setTimeout(ms, () => {
        req.destroy();
        finish({ error: "timeout" });
      });
    } catch (e) {
      finish({ error: String((e && e.message) || e) });
    }
  });
}

module.exports = async (req, res) => {
  res.setHeader("X-Vocab", "1");
  const q = req.query || {};
  if (q.ping) {
    if (q.sleep) await new Promise((r) => setTimeout(r, Math.min(Number(q.sleep) || 0, 8000)));
    if (q.g) {
      const r = await get("https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=hello", 3000);
      return res.status(200).json({ g: { status: r.status, type: r.type, bytes: r.body ? r.body.length : 0, error: r.error } });
    }
    return res.status(200).json({ ok: true, build: 10 });
  }

  const text = String(q.text || q.t || "").replace(/\s+/g, " ").trim().slice(0, 200);
  let lang = String(q.lang || q.l || "en");
  if (!text) return res.status(400).json({ error: "No text" });
  if (!LANGS.has(lang)) lang = "en";
  if (q.echo) return res.status(200).json({ echo: true, text, lang });

  const order = lang === "uz" ? ["uz", "tr"] : [lang];
  const debug = [];
  for (const tl of order) {
    const url =
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" + tl + "&q=" + encodeURIComponent(text);
    const r = await get(url, 5000);
    debug.push({ tl, status: r.status, type: r.type, bytes: r.body ? r.body.length : 0, error: r.error });
    if (r.error || r.status !== 200 || !String(r.type).includes("audio") || r.body.length < 400) continue;
    if (q.debug) return res.status(200).json({ ok: true, debug });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.setHeader("X-Tts-Lang", tl);
    return res.status(200).send(r.body);
  }
  res.setHeader("Cache-Control", "no-store");
  if (q.debug) return res.status(200).json({ ok: false, debug });
  return res.status(502).json({ error: "Speech service unavailable", debug });
};
