// Computes the fund's true equity in MYR, correctly reflecting FX exposure on both
// uninvested cash AND US-denominated holdings — since contributed capital gets
// converted to USD (sitting at the broker) regardless of whether it's currently
// invested in a stock or just sitting as cash.
//
// Cash is tracked as a USD figure: each contribution converts to USD using the FX
// rate in effect at the time it was made (fxRateAtEntry, stored per contribution
// lot); cash decreases when a US position is opened, increases when one is closed.
// The resulting USD cash balance is converted to MYR at TODAY's live rate for
// display — same treatment as US holdings' market value — so idle USD cash moves
// with the exchange rate just like it would in the real brokerage account.
//
// KLSE holdings/cash are simpler: already MYR-denominated, no FX conversion needed.
// Known limitation: KLSE proceeds from closed positions are folded directly into
// total equity rather than tracked as a separate MYR cash pool — fine as long as the
// fund isn't simultaneously running a real dual-currency cash balance across both
// markets; revisit if that becomes the case.

const { getContributions } = require("./contributions");

function computeFundEquity(investorList, holdingsList, closedPositions, usQuoteResult, klseQuoteResult, liveFxRate) {
  let totalCapitalMYR = 0; // sum of everything customers have ever contributed (fixed, MYR)
  let totalContributedUSD = 0; // same money, converted to USD at each lot's own entry rate

  for (const inv of investorList) {
    for (const c of getContributions(inv)) {
      const amount = c.amount || 0;
      totalCapitalMYR += amount;
      const entryRate = c.fxRateAtEntry || liveFxRate; // fallback for legacy lots with no stored rate
      totalContributedUSD += entryRate > 0 ? amount / entryRate : 0;
    }
  }

  let openCostUSD = 0; // cost of currently open US positions, in USD
  let openValueMYR = 0; // market value of ALL holdings (US converted live + KLSE native MYR)
  for (const h of holdingsList) {
    if (h.exchange === "US") {
      const livePrice = usQuoteResult[h.symbol];
      const price = livePrice !== undefined ? livePrice : h.price;
      openCostUSD += h.avgCost * h.qty;
      openValueMYR += price * h.qty * liveFxRate;
    } else {
      const livePrice = klseQuoteResult[h.symbol];
      const price = livePrice !== undefined ? livePrice : h.price;
      openValueMYR += price * h.qty;
    }
  }

  let realizedUSD = 0; // realized P&L from closed US positions, in USD
  let realizedMYR_KLSE = 0; // realized P&L from closed KLSE positions, already MYR
  for (const p of closedPositions || []) {
    if (p.currency === "USD") {
      realizedUSD += (p.exitPrice - p.avgCost) * p.qty;
    } else {
      realizedMYR_KLSE += p.realizedPnL || 0;
    }
  }

  const cashUSD = totalContributedUSD - openCostUSD + realizedUSD;
  const cashMYR = cashUSD * liveFxRate;

  const totalFundEquity = cashMYR + openValueMYR + realizedMYR_KLSE;

  return { totalCapitalMYR, cashUSD, cashMYR, openValueMYR, totalFundEquity };
}

module.exports = { computeFundEquity };
