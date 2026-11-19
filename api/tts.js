// Vercel serverless function: turns a short text into natural speech (MP3).
// GET /api/tts?lang=en|uz|ru|tr&text=TEXT&g=f|m   (max 200 characters)
// 1) Microsoft neural voices (real Uzbek: Madina / Sardor), 2) Google voice as a fallback.

const https = require("https");
const crypto = require("crypto");
let WS = null;
try {
  WS = require("ws");
} catch (e) {
  WS = null;
}

const LANGS = new Set(["en", "uz", "tr", "ru"]);
const VOICES = {
  en: { f: "en-US-JennyNeural", m: "en-US-GuyNeural" },
  uz: { f: "uz-UZ-MadinaNeural", m: "uz-UZ-SardorNeural" },
  ru: { f: "ru-RU-SvetlanaNeural", m: "ru-RU-DmitryNeural" },
  tr: { f: "tr-TR-EmelNeural", m: "tr-TR-AhmetNeural" },
};
const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROME = "130.0.2849.68";
const UA_G =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function gec() {
  let t = Date.now() / 1000 + 11644473600;
  t -= t % 300;
  const ticks = BigInt(Math.floor(t)) * 10000000n;
  return crypto.createHash("sha256").update(ticks.toString() + TOKEN, "ascii").digest("hex").toUpperCase();
}
const uid = () => crypto.randomUUID().replace(/-/g, "");
const xmlEsc = (s) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
function fullVoice(v) {
  const m = v.match(/^([a-z]{2,3}-[A-Z]{2,})-(.+)$/);
  return m ? `Microsoft Server Speech Text to Speech Voice (${m[1]}, ${m[2]})` : v;
}

function edgeTTS(text, voice, ms) {
  return new Promise((resolve) => {
    if (!WS) return resolve({ error: "ws module missing" });
    const major = CHROME.split(".")[0];
    const url =
      "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=" +
      TOKEN +
      "&ConnectionId=" +
      uid() +
      "&Sec-MS-GEC=" +
      gec() +
      "&Sec-MS-GEC-Version=1-" +
      CHROME;
    const chunks = [];
    let done = false;
    let ws;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws && ws.terminate();
      } catch (e) {}
      resolve(v);
    };
    const timer = setTimeout(() => finish({ error: "timeout" }), ms);
    try {
      ws = new WS(url, {
        headers: {
          Pragma: "no-cache",
          "Cache-Control": "no-cache",
          Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
          Cookie: "muid=" + crypto.randomBytes(16).toString("hex").toUpperCase() + ";",
        },
      });
    } catch (e) {
      return finish({ error: String((e && e.message) || e) });
    }
    ws.on("open", () => {
      const ts = new Date().toString();
      ws.send(
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
      );
      const ssml =
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
        `<voice name='${fullVoice(voice)}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${xmlEsc(text)}</prosody></voice></speak>`;
      ws.send(
        `X-RequestId:${uid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n${ssml}`
      );
    });
    ws.on("message", (data, isBinary) => {
      const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (isBinary) {
        if (b.length < 2) return;
        const hl = b.readUInt16BE(0);
        const head = b.slice(2, 2 + hl).toString();
        if (head.includes("Path:audio")) chunks.push(b.slice(2 + hl));
      } else if (b.toString().includes("Path:turn.end")) {
        finish({ body: Buffer.concat(chunks) });
      }
    });
    ws.on("unexpected-response", (rq, rs) => finish({ error: "http " + rs.statusCode }));
    ws.on("error", (e) => finish({ error: String((e && e.message) || e) }));
    ws.on("close", () => finish(chunks.length ? { body: Buffer.concat(chunks) } : { error: "closed" }));
  });
}

function googleTTS(text, tl, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const url =
        "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" + tl + "&q=" + encodeURIComponent(text);
      const req = https.get(url, { headers: { "User-Agent": UA_G, Referer: "https://translate.google.com/" } }, (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          const body = Buffer.concat(chunks);
          const type = r.headers["content-type"] || "";
          if (r.statusCode === 200 && type.includes("audio")) finish({ body });
          else finish({ error: "google " + r.statusCode });
        });
        r.on("error", (e) => finish({ error: String(e.message || e) }));
      });
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
  if (q.ping) return res.status(200).json({ ok: true, build: 11, ws: !!WS });

  const text = String(q.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  let lang = String(q.lang || "en");
  const gender = q.g === "m" ? "m" : "f";
  if (!text) return res.status(400).json({ error: "No text" });
  if (!LANGS.has(lang)) lang = "en";

  const debug = [];
  let body = null;
  let engine = "";

  const e = await edgeTTS(text, VOICES[lang][gender], 8000);
  debug.push({ engine: "edge", voice: VOICES[lang][gender], bytes: e.body ? e.body.length : 0, error: e.error });
  if (e.body && e.body.length > 400) {
    body = e.body;
    engine = "edge";
  } else {
    const g = await googleTTS(text, lang === "uz" ? "tr" : lang, 5000);
    debug.push({ engine: "google", bytes: g.body ? g.body.length : 0, error: g.error });
    if (g.body && g.body.length > 400) {
      body = g.body;
      engine = "google";
    }
  }

  if (q.debug) return res.status(200).json({ ok: !!body, engine, debug });
  if (!body) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Speech service unavailable", debug });
  }
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader(
    "Cache-Control",
    engine === "edge" ? "public, max-age=31536000, s-maxage=31536000, immutable" : "public, max-age=3600, s-maxage=3600"
  );
  res.setHeader("X-Tts-Engine", engine);
  return res.status(200).send(body);
};
