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

function formatDateDMY(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// The date the next guarantee milestone is paid out: exactly `years` years after the
// investment date, minus one day (e.g. invested 1/1/2026 -> first payout 31/12/2026).
function addPeriodMinusOneDay(dateStr, years) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() - 1);
  return d;
}

async function computeInvestorSummary(investor, investorList, holdingsList, totalCapital, closedPositions) {
  const usSymbols = holdingsList.filter((h) => h.exchange === "US").map((h) => h.symbol);
  const klseSymbols = holdingsList.filter((h) => h.exchange === "KLSE").map((h) => h.symbol);

  const [usQ, klseQ, fx] = await Promise.all([
    fetchUsQuotes(usSymbols),
    fetchKlseQuotes(klseSymbols),
    fetchFxRate(),
  ]);
  const fxRate = fx || 4.7;

  let totalOpenValue = 0;
  let totalOpenCost = 0;
  for (const h of holdingsList) {
    const livePrice = h.exchange === "US" ? usQ.result[h.symbol] : klseQ.result[h.symbol];
    const price = livePrice !== undefined ? livePrice : h.price;
    const valueMYR = h.exchange === "US" ? price * h.qty * fxRate : price * h.qty;
    const costMYR = h.exchange === "US" ? h.avgCost * h.qty * fxRate : h.avgCost * h.qty;
    totalOpenValue += valueMYR;
    totalOpenCost += costMYR;
  }
  const unrealizedGain = totalOpenValue - totalOpenCost;
  const realizedPnL = (closedPositions || []).reduce((s, p) => s + (p.realizedPnL || 0), 0);

  // Overall fund performance, based on total capital rather than just what's
  // currently in open positions — this way, realized gains/losses from closed
  // trades stay reflected even after the position itself is gone.
  const overallGain = unrealizedGain + realizedPnL;
  const fundReturnPct = totalCapital > 0 ? overallGain / totalCapital : 0;
  const totalFundValue = totalCapital + overallGain; // total fund equity (cash + holdings)

  const totalContributed = investorList.reduce((s, i) => s + (i.contributed || 0), 0);

  const contributed = investor.contributed || 0;
  const actualValue = contributed * (1 + fundReturnPct);

  const years = yearsSince(investor.joinDate);
  const guaranteedValue = contributed * Math.pow(1 + GUARANTEED_ANNUAL_RATE, years);

  // Current Value reflects actual fund performance only. The guarantee is shown
  // separately below as a target/commitment, not blended into this number.
  const currentValue = actualValue;
  const gain = currentValue - contributed;
  const gainPct = contributed ? (gain / contributed) * 100 : 0;
  const sharePct = totalFundValue > 0 ? (currentValue / totalFundValue) * 100 : 0;

  const symbols = [...new Set(holdingsList.map((h) => h.symbol))];

  // Next guarantee milestone: the upcoming annual target that hasn't been reached yet.
  // Shown purely as an informational commitment — separate from Current Value above.
  let investmentDate = null;
  let guaranteedTargetAmount = null;
  let guaranteedPayoutDate = null;
  if (investor.joinDate) {
    const joinDateObj = new Date(investor.joinDate);
    if (!isNaN(joinDateObj.getTime())) {
      investmentDate = formatDateDMY(joinDateObj);
      const periodNumber = Math.floor(years) + 1;
      guaranteedTargetAmount = contributed * Math.pow(1 + GUARANTEED_ANNUAL_RATE, periodNumber);
      guaranteedPayoutDate = formatDateDMY(addPeriodMinusOneDay(investor.joinDate, periodNumber));
    }
  }

  return {
    name: investor.name,
    contributed,
    sharePct,
    currentValue,
    gain,
    gainPct,
    belowGuarantee: guaranteedValue > actualValue,
    investmentDate,
    guaranteedTargetAmount,
    guaranteedPayoutDate,
    symbols,
    errors: [...usQ.errors, ...klseQ.errors],
  };
}

module.exports = { computeInvestorSummary, GUARANTEED_ANNUAL_RATE, yearsSince };
