// Serverless function: keeps API keys server-side.
// Reads TWELVE_DATA_KEY and ITICK_TOKEN from environment variables (set in Vercel project settings),
// never from the client. The browser calls /api/prices?us=AAPL,NVDA&klse=MAYBANK,TENAGA,PBBANK
// and gets back plain price data with no keys attached.

module.exports = async function handler(req, res) {
  const us = (req.query.us || "").split(",").filter(Boolean);
  const klse = (req.query.klse || "").split(",").filter(Boolean);

  const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY;
  const ITICK_TOKEN = process.env.ITICK_TOKEN;

  const result = { us: {}, klse: {}, fx: null, errors: [] };

  // --- US quotes via Twelve Data ---
  if (us.length) {
    if (!TWELVE_DATA_KEY) {
      result.errors.push("TWELVE_DATA_KEY not configured on server");
    } else {
      try {
        const r = await fetch(
          `https://api.twelvedata.com/quote?symbol=${us.join(",")}&apikey=${TWELVE_DATA_KEY}`
        );
        const data = await r.json();
        if (data.status === "error" || data.code) {
          result.errors.push(`US: ${data.message || "unknown error"}`);
        } else if (us.length === 1) {
          if (data.close) result.us[us[0]] = parseFloat(data.close);
        } else {
          for (const sym of us) {
            if (data[sym] && data[sym].close) result.us[sym] = parseFloat(data[sym].close);
          }
        }
      } catch (e) {
        result.errors.push(`US fetch failed: ${e.message}`);
      }
    }
  }

  // --- KLSE quotes via iTick (one call per symbol, run in parallel) ---
  if (klse.length) {
    if (!ITICK_TOKEN) {
      result.errors.push("ITICK_TOKEN not configured on server");
    } else {
      await Promise.all(
        klse.map(async (sym) => {
          try {
            const r = await fetch(`https://api.itick.org/stock/quote?region=MY&code=${sym}`, {
              headers: { accept: "application/json", token: ITICK_TOKEN },
            });
            const json = await r.json();
            if (json.code === 0 && json.data && json.data.ld) {
              result.klse[sym] = parseFloat(json.data.ld);
            } else {
              result.errors.push(`KLSE ${sym}: ${json.msg || "code " + json.code}`);
            }
          } catch (e) {
            result.errors.push(`KLSE ${sym} fetch failed: ${e.message}`);
          }
        })
      );
    }
  }

  // --- USD/MYR FX rate via Twelve Data ---
  if (TWELVE_DATA_KEY) {
    try {
      const r = await fetch(
        `https://api.twelvedata.com/exchange_rate?symbol=USD/MYR&apikey=${TWELVE_DATA_KEY}`
      );
      const data = await r.json();
      if (data.rate) result.fx = parseFloat(data.rate);
      else result.errors.push(`FX: ${data.message || "unknown error"}`);
    } catch (e) {
      result.errors.push(`FX fetch failed: ${e.message}`);
    }
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(result);
};
