# Vercel Python function: natural neural speech (MP3) with real Uzbek voices.
# GET /api/speak?lang=en|uz|ru|tr&g=f|m&text=TEXT   (max 200 characters)
# Uses Microsoft Edge neural voices through the edge-tts library; falls back to Google's voice.

import asyncio
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

import edge_tts

VOICES = {
    "en": {"f": "en-US-JennyNeural", "m": "en-US-GuyNeural"},
    "uz": {"f": "uz-UZ-MadinaNeural", "m": "uz-UZ-SardorNeural"},
    "ru": {"f": "ru-RU-SvetlanaNeural", "m": "ru-RU-DmitryNeural"},
    "tr": {"f": "tr-TR-EmelNeural", "m": "tr-TR-AhmetNeural"},
}


async def _edge(text, voice):
    buf = bytearray()
    async for chunk in edge_tts.Communicate(text, voice).stream():
        if chunk.get("type") == "audio":
            buf.extend(chunk["data"])
    return bytes(buf)


def edge(text, voice):
    try:
        return asyncio.run(asyncio.wait_for(_edge(text, voice), 8)), None
    except Exception as e:  # noqa: BLE001
        return b"", repr(e)[:300]


def google(text, lang):
    tl = "tr" if lang == "uz" else lang
    url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" + tl + "&q=" + quote(text)
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://translate.google.com/"})
        with urlopen(req, timeout=5) as r:
            if r.status == 200 and "audio" in (r.headers.get("Content-Type") or ""):
                return r.read(), None
            return b"", "google %s" % r.status
    except Exception as e:  # noqa: BLE001
        return b"", repr(e)[:300]


class handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("X-Vocab", "1")
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        if q.get("ping"):
            return self._json(200, {"ok": True, "engine": "python", "edge_tts": getattr(edge_tts, "__version__", "?")})
        text = " ".join((q.get("text", [""])[0]).split())[:200]
        lang = q.get("lang", ["en"])[0]
        lang = lang if lang in VOICES else "en"
        g = "m" if q.get("g", ["f"])[0] == "m" else "f"
        if not text:
            return self._json(400, {"error": "No text"})

        voice = VOICES[lang][g]
        audio, err = edge(text, voice)
        engine = "edge"
        debug = [{"engine": "edge", "voice": voice, "bytes": len(audio), "error": err}]
        if len(audio) < 400:
            audio, err2 = google(text, lang)
            engine = "google"
            debug.append({"engine": "google", "bytes": len(audio), "error": err2})

        if q.get("debug"):
            return self._json(200, {"ok": len(audio) >= 400, "engine": engine, "debug": debug})
        if len(audio) < 400:
            return self._json(502, {"error": "Speech service unavailable", "debug": debug})

        self.send_response(200)
        self.send_header("X-Vocab", "1")
        self.send_header("X-Tts-Engine", engine)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header(
            "Cache-Control",
            "public, max-age=31536000, s-maxage=31536000, immutable" if engine == "edge" else "public, max-age=3600",
        )
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)
