// Shared calculation logic: given an investor, the full investor list, and the fund's
// holdings, compute what that investor should see (their share of the fund value,
// with a guaranteed minimum annualized return).

const { fetchUsQuotes, fetchKlseQuotes, fetchFxRate } = require("./market");

const GUARANTEED_ANNUAL_RATE = 0.06; // 6% p.a., compounded annually, as a floor

function yearsSince(dateStr) {
  if (!dateStr) return 0;
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  if (isNaN(then)) return 0;
  return Math.max(0, (now - then) / (1000 * 60 * 60 * 24 * 365.25));
}

async function computeInvestorSummary(investor, investorList, holdingsList) {
  const usSymbols = holdingsList.filter((h) => h.exchange === "US").map((h) => h.symbol);
  const klseSymbols = holdingsList.filter((h) => h.exchange === "KLSE").map((h) => h.symbol);

  const [usQ, klseQ, fx] = await Promise.all([
    fetchUsQuotes(usSymbols),
    fetchKlseQuotes(klseSymbols),
    fetchFxRate(),
  ]);
  const fxRate = fx || 4.7;

  let totalFundValue = 0;
  for (const h of holdingsList) {
    const livePrice = h.exchange === "US" ? usQ.result[h.symbol] : klseQ.result[h.symbol];
    const price = livePrice !== undefined ? livePrice : h.price;
    const valueMYR = h.exchange === "US" ? price * h.qty * fxRate : price * h.qty;
    totalFundValue += valueMYR;
  }

  const totalContributed = investorList.reduce((s, i) => s + (i.contributed || 0), 0);
  const fundReturnPct = totalContributed > 0 ? (totalFundValue - totalContributed) / totalContributed : 0;

  const contributed = investor.contributed || 0;
  const actualValue = contributed * (1 + fundReturnPct);

  const years = yearsSince(investor.joinDate);
  const guaranteedValue = contributed * Math.pow(1 + GUARANTEED_ANNUAL_RATE, years);

  const currentValue = Math.max(actualValue, guaranteedValue);
  const gain = currentValue - contributed;
  const gainPct = contributed ? (gain / contributed) * 100 : 0;
  const sharePct = totalFundValue > 0 ? (currentValue / totalFundValue) * 100 : 0;

  const symbols = [...new Set(holdingsList.map((h) => h.symbol))];

  return {
    name: investor.name,
    contributed,
    sharePct,
    currentValue,
    gain,
    gainPct,
    usingGuarantee: guaranteedValue > actualValue,
    symbols,
    errors: [...usQ.errors, ...klseQ.errors],
  };
}

module.exports = { computeInvestorSummary, GUARANTEED_ANNUAL_RATE, yearsSince };
