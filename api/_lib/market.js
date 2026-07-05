// Shared helpers for fetching live prices, used by both api/prices.js (admin dashboard)
// and api/customer-view.js (customer-facing summary page).

const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY;
const ITICK_TOKEN = process.env.ITICK_TOKEN;

async function fetchUsQuotes(symbols) {
  const result = {};
  const errors = [];
  if (!symbols.length) return { result, errors };
  if (!TWELVE_DATA_KEY) {
    errors.push("TWELVE_DATA_KEY not configured on server");
    return { result, errors };
  }
  try {
    const r = await fetch(
      `https://api.twelvedata.com/quote?symbol=${symbols.join(",")}&apikey=${TWELVE_DATA_KEY}`
    );
    const data = await r.json();
    if (data.status === "error" || data.code) {
      errors.push(`US: ${data.message || "unknown error"}`);
    } else if (symbols.length === 1) {
      if (data.close) result[symbols[0]] = parseFloat(data.close);
    } else {
      for (const sym of symbols) {
        if (data[sym] && data[sym].close) result[sym] = parseFloat(data[sym].close);
      }
    }
  } catch (e) {
    errors.push(`US fetch failed: ${e.message}`);
  }
  return { result, errors };
}

async function fetchKlseQuotes(symbols) {
  const result = {};
  const errors = [];
  if (!symbols.length) return { result, errors };
  if (!ITICK_TOKEN) {
    errors.push("ITICK_TOKEN not configured on server");
    return { result, errors };
  }
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const r = await fetch(`https://api.itick.org/stock/quote?region=MY&code=${sym}`, {
          headers: { accept: "application/json", token: ITICK_TOKEN },
        });
        const rawText = await r.text();
        let json;
        try {
          json = JSON.parse(rawText);
        } catch {
          errors.push(`KLSE ${sym}: HTTP ${r.status}, non-JSON response`);
          return;
        }
        if (json.code === 0 && json.data && json.data.ld) {
          result[sym] = parseFloat(json.data.ld);
        } else {
          errors.push(`KLSE ${sym}: HTTP ${r.status}, response: ${JSON.stringify(json).slice(0, 150)}`);
        }
      } catch (e) {
        errors.push(`KLSE ${sym} fetch failed: ${e.message}`);
      }
    })
  );
  return { result, errors };
}

async function fetchFxRate() {
  if (!TWELVE_DATA_KEY) return null;
  try {
    const r = await fetch(
      `https://api.twelvedata.com/exchange_rate?symbol=USD/MYR&apikey=${TWELVE_DATA_KEY}`
    );
    const data = await r.json();
    return data.rate ? parseFloat(data.rate) : null;
  } catch {
    return null;
  }
}

module.exports = { fetchUsQuotes, fetchKlseQuotes, fetchFxRate };
