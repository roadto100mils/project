// Shared calculation logic: given an investor, the full investor list, and the fund's
// holdings, compute what that investor should see (their share of the fund value,
// with a guaranteed minimum annualized return per contribution).
//
// Investors can have multiple contributions at different dates (e.g. RM5,000 in July,
// another RM5,000 in October) — each is tracked separately as its own "lot" so the
// 6% guarantee compounds correctly from each lot's own date, instead of treating a
// later top-up as if it had been invested since the very first contribution.

const { fetchUsQuotes, fetchKlseQuotes, fetchFxRate } = require("./market");

const GUARANTEED_ANNUAL_RATE = 0.06; // 6% p.a., compounded annually, as a floor per lot

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

// Returns an investor's contributions as a list of {id, amount, date} lots.
// Falls back to legacy single contributed+joinDate fields for older records that
// haven't been migrated to the multi-contribution format yet.
function getContributions(investor) {
  if (Array.isArray(investor.contributions) && investor.contributions.length) {
    return investor.contributions;
  }
  if (investor.contributed) {
    return [{ id: 1, amount: investor.contributed, date: investor.joinDate || null }];
  }
  return [];
}

function totalContributed(investor) {
  return getContributions(investor).reduce((s, c) => s + (c.amount || 0), 0);
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

  const contributions = getContributions(investor);
  const contributed = totalContributed(investor);

  // Simplification retained: actual performance applies the fund's overall return
  // equally to all of an investor's money, regardless of which lot/date it came in.
  // The guarantee below is calculated per-lot and is more precise.
  const actualValue = contributed * (1 + fundReturnPct);
  const currentValue = actualValue;
  const gain = currentValue - contributed;
  const gainPct = contributed ? (gain / contributed) * 100 : 0;
  const sharePct = totalFundValue > 0 ? (currentValue / totalFundValue) * 100 : 0;

  const symbols = [...new Set(holdingsList.map((h) => h.symbol))];

  // Per-lot guarantee breakdown: each contribution compounds independently from its
  // own date, so a later top-up isn't unfairly credited with guarantee growth from
  // before it was even invested.
  let totalGuaranteedValue = 0;
  const guaranteeBreakdown = contributions
    .filter((c) => c.date)
    .map((c) => {
      const years = yearsSince(c.date);
      const lotGuaranteedValue = (c.amount || 0) * Math.pow(1 + GUARANTEED_ANNUAL_RATE, years);
      totalGuaranteedValue += lotGuaranteedValue;
      const periodNumber = Math.floor(years) + 1;
      const targetAmount = (c.amount || 0) * Math.pow(1 + GUARANTEED_ANNUAL_RATE, periodNumber);
      const payoutDate = formatDateDMY(addPeriodMinusOneDay(c.date, periodNumber));
      return {
        investmentDate: formatDateDMY(new Date(c.date)),
        amount: c.amount,
        guaranteedTargetAmount: targetAmount,
        guaranteedPayoutDate: payoutDate,
      };
    });

  return {
    name: investor.name,
    contributed,
    sharePct,
    currentValue,
    gain,
    gainPct,
    belowGuarantee: totalGuaranteedValue > actualValue,
    guaranteeBreakdown,
    symbols,
    errors: [...usQ.errors, ...klseQ.errors],
  };
}

module.exports = { computeInvestorSummary, GUARANTEED_ANNUAL_RATE, yearsSince, getContributions, totalContributed };
