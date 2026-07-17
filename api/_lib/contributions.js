// Shared helper: returns an investor's contributions as a list of
// {id, amount, date, fxRateAtEntry} lots. Falls back to legacy single
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

module.exports = { getContributions, totalContributed };
