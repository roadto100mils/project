// Shared calculation logic: given an investor, the full investor list, and the fund's
// holdings, compute what that investor should see (their share of the fund value).
// Used by the username/password login endpoint.

const { fetchUsQuotes, fetchKlseQuotes, fetchFxRate } = require("./market");

async function computeInvestorSummary(investor, investorList, holdingsList) {
  const usSymbols = holdingsList.filter((h) => h.exchange === "US").map((h) => h.symbol);
  const klseSymbols = holdingsList.filter((h) => h.exchange === "KLSE").map((h) => h.symbol);

  const [usQ, klseQ, fx] = await Promise.all([
    fetchUsQuotes(usSymbols),
    fetchKlseQuotes(klseSymbols),
    fetchFxRate(),
  ]);
  const fxRate = fx || 4.7;

  let totalValue = 0;
  for (const h of holdingsList) {
    const livePrice = h.exchange === "US" ? usQ.result[h.symbol] : klseQ.result[h.symbol];
    const price = livePrice !== undefined ? livePrice : h.price;
    const valueMYR = h.exchange === "US" ? price * h.qty * fxRate : price * h.qty;
    totalValue += valueMYR;
  }

  const totalContributed = investorList.reduce((s, i) => s + (i.contributed || 0), 0);
  const share = totalContributed > 0 ? investor.contributed / totalContributed : 0;
  const currentValue = totalValue * share;
  const gain = currentValue - investor.contributed;
  const gainPct = investor.contributed ? (gain / investor.contributed) * 100 : 0;
  const symbols = [...new Set(holdingsList.map((h) => h.symbol))];

  return {
    name: investor.name,
    contributed: investor.contributed,
    sharePct: share * 100,
    currentValue,
    gain,
    gainPct,
    symbols,
    errors: [...usQ.errors, ...klseQ.errors],
  };
}

module.exports = { computeInvestorSummary };
