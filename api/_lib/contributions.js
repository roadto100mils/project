// Shared helper: returns an investor's contributions as a list of
// {id, amount, date, fxRateAtEntry, unitsIssued} lots. Falls back to legacy single
// contributed+joinDate fields for older records not yet migrated to the
// multi-contribution format.
//
// Split into its own file (rather than living in investorCalc.js) because both
// investorCalc.js and fundCalc.js need it, and having them import from each other
// would create a circular dependency.

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

// A contribution's "units" — how many fund units it bought. For lots created before
// unit tracking existed, falls back to units = amount (equivalent to having bought in
// at a NAV of 1.00/unit) so existing data keeps behaving exactly as it did under the
// old proportional model until a new contribution is added.
function getLotUnits(contribution) {
  return contribution.unitsIssued != null ? contribution.unitsIssued : (contribution.amount || 0);
}

// Total units an investor holds across all their contribution lots.
function totalUnits(investor) {
  return getContributions(investor).reduce((s, c) => s + getLotUnits(c), 0);
}

// Total units outstanding across every investor in the fund.
function totalUnitsOutstanding(investorList) {
  return investorList.reduce((s, inv) => s + totalUnits(inv), 0);
}

// Net asset value per unit, given the fund's current total equity. Bootstraps to
// 1.00/unit when there are no units yet (the very first contribution ever made).
function navPerUnit(totalFundEquity, unitsOutstanding) {
  return unitsOutstanding > 0 ? totalFundEquity / unitsOutstanding : 1;
}

module.exports = {
  getContributions,
  totalContributed,
  getLotUnits,
  totalUnits,
  totalUnitsOutstanding,
  navPerUnit,
};
