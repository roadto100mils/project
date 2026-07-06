// Serverless function: keeps API keys server-side.
// Reads TWELVE_DATA_KEY and ITICK_TOKEN from environment variables (set in Vercel project settings),
// never from the client. The browser calls /api/prices?us=AAPL,NVDA&klse=MAYBANK,TENAGA,PBBANK
// and gets back plain price data (and company names, where available) with no keys attached.

const { fetchUsQuotes, fetchKlseQuotes, fetchFxRate } = require("./_lib/market");

module.exports = async function handler(req, res) {
  const us = (req.query.us || "").split(",").filter(Boolean);
  const klse = (req.query.klse || "").split(",").filter(Boolean);

  const [usQ, klseQ, fx] = await Promise.all([
    fetchUsQuotes(us),
    fetchKlseQuotes(klse),
    fetchFxRate(),
  ]);

  const errors = [...usQ.errors, ...klseQ.errors];
  if (us.length && !fx) errors.push("FX: could not fetch USD/MYR rate");

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    us: usQ.result,
    usNames: usQ.names,
    klse: klseQ.result,
    fx,
    errors,
  });
};
