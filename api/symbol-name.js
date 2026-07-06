// Looks up a company name for a single symbol, on demand (e.g. when the admin types
// a new symbol into the dashboard). Kept separate from the bulk /api/prices refresh
// so name lookups don't eat into the price-fetching rate limit.

const { fetchUsQuotes, fetchKlseName } = require("./_lib/market");
const { checkAdminAuth } = require("./_lib/adminAuth");

module.exports = async function handler(req, res) {
  if (!checkAdminAuth(req, res)) return;

  const { exchange, symbol } = req.query;
  if (!exchange || !symbol) {
    res.status(400).json({ error: "Missing exchange or symbol" });
    return;
  }

  let name = null;
  let debug = null;
  if (exchange === "US") {
    const usQ = await fetchUsQuotes([symbol]);
    name = usQ.names[symbol] || null;
    if (!name) debug = usQ.errors.join("; ") || "No name returned";
  } else {
    const result = await fetchKlseName(symbol);
    name = result.name;
    debug = result.debug;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ name, debug });
};
