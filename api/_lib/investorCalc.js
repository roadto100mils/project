// Shared calculation logic: given an investor, the full investor list, and the fund's
// holdings, compute what that investor should see (their unit-based share of the
// fund value, with a guaranteed minimum annualized return per contribution).
//
// Investors can have multiple contributions at different dates (e.g. RM5,000 in July,
// another RM5,000 in October) — each is tracked separately as its own "lot" so the
// 6% guarantee compounds correctly from each lot's own date, AND so each lot buys
// fund "units" at whatever the fund's NAV/unit happened to be on that date. This is
// what stops a new investor's contribution from diluting (or inflating) existing
// investors' gains — same mechanism a real mutual fund uses for subscriptions.

const { fetchUsQuotes, fetchKlseQuotes, fetchFxRate } = require("./market");
const { computeFundEquity } = require("./fundCalc");
const {
  getContributions,
  totalContributed,
  totalUnits,
  totalUnitsOutstanding,
  navPerUnit,
} = require("./contributions");

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

async function computeInvestorSummary(investor, investorList, holdingsList, closedPositions) {
  const usSymbols = holdingsList.filter((h) => h.exchange === "US").map((h) => h.symbol);
  const klseSymbols = holdingsList.filter((h) => h.exchange === "KLSE").map((h) => h.symbol);

  const [usQ, klseQ, fx] = await Promise.all([
    fetchUsQuotes(usSymbols),
    fetchKlseQuotes(klseSymbols),
    fetchFxRate(),
  ]);
  const fxRate = fx || 4.7;

  const { totalFundEquity } = computeFundEquity(
    investorList,
    holdingsList,
    closedPositions,
    usQ.result,
    klseQ.result,
    fxRate
  );

  const unitsOutstanding = totalUnitsOutstanding(investorList);
  const nav = navPerUnit(totalFundEquity, unitsOutstanding);

  const contributions = getContributions(investor);
  const contributed = totalContributed(investor);
  const myUnits = totalUnits(investor);

  // Unit-based value: this investor's units × today's NAV/unit. Correctly excludes
  // gains/losses made before this investor's units existed, and includes their fair
  // share of everything that's happened since.
  const currentValue = myUnits * nav;
  const gain = currentValue - contributed;
  const gainPct = contributed ? (gain / contributed) * 100 : 0;
  const sharePct = unitsOutstanding > 0 ? (myUnits / unitsOutstanding) * 100 : 0;

  const symbols = [...new Set(holdingsList.map((h) => h.symbol))];

  // Per-lot guarantee breakdown: each contribution compounds independently from its
  // own date, so a later top-up isn't unfairly credited with guarantee growth from
  // before it was even invested. This floor is compared against the unit-based value.
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
    belowGuarantee: totalGuaranteedValue > currentValue,
    guaranteeBreakdown,
    symbols,
    errors: [...usQ.errors, ...klseQ.errors],
  };
}

module.exports = {
  computeInvestorSummary,
  GUARANTEED_ANNUAL_RATE,
  yearsSince,
  getContributions,
  totalContributed,
};
