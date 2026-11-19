// Vercel serverless function: downloads a Google Sheet as .xlsx so the page can read every tab.
// The sheet must be shared as "Anyone with the link can view".
// Optional: set SHEET_IDS (comma-separated) in Vercel env vars to allow only your own sheets.

const ID_RE = /^[a-zA-Z0-9_-]{15,}$/;

module.exports = async (req, res) => {
  res.setHeader("X-Vocab", "1");
  res.setHeader("Cache-Control", "no-store");

  const id = String((req.query && req.query.id) || "");
  if (!ID_RE.test(id)) {
    return res.status(400).json({ error: "Bad sheet id" });
  }

  const allowed = (process.env.SHEET_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(id)) {
    return res.status(403).json({ error: "This sheet is not allowed" });
  }

  try {
    const r = await fetch(
      `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`,
      { redirect: "follow" }
    );
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.includes("spreadsheetml")) {
      return res.status(403).json({ error: "The sheet is not shared with 'Anyone with the link'" });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", type);
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: "Could not reach Google Sheets" });
  }
};
