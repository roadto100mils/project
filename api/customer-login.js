// Checks a customer's username/password against the investor list, and if it matches,
// returns their computed share of the fund. No sessions/cookies — the password is
// checked fresh on each page load. This is a lightweight access gate, not
// bank-grade security; good enough to keep casual visitors out, not a determined attacker.

const { Redis } = require("@upstash/redis");
const { computeInvestorSummary, totalContributed } = require("./_lib/investorCalc");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({ error: "Redis environment variables not found" });
    return;
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: "Missing username or password" });
    return;
  }

  try {
    const [holdings, investors, closedPositions, messages, snapshots] = await Promise.all([
      redis.get("holdings:default"),
      redis.get("investors"),
      redis.get("closedPositions"),
      redis.get("messages"),
      redis.get("snapshots"),
    ]);
    const investorList = investors || [];
    const investor = investorList.find(
      (i) => i.username === username && i.password === password
    );
    if (!investor) {
      res.status(401).json({ error: "Incorrect username or password" });
      return;
    }
    const summary = await computeInvestorSummary(
      investor,
      investorList,
      holdings || [],
      closedPositions || []
    );

    const myMessages = (messages || [])
      .filter((m) => m.recipientType === "all" || m.recipientId === investor.id)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    // Approximate historical value: applies each day's recorded fund-wide return to
    // this investor's current total contribution. Older snapshots recorded before
    // fund equity tracking was FX-aware fall back to their own stored totalCapital
    // (or today's, if that's missing too) as an approximation — a known
    // simplification, same spirit as the live calculation.
    const totalCapitalNow = investorList.reduce((s, i) => s + totalContributed(i), 0);
    const myContributed = totalContributed(investor);
    const assetHistory = (snapshots || []).map((s) => {
      const capitalAtSnapshot = typeof s.totalCapital === "number" && s.totalCapital > 0 ? s.totalCapital : totalCapitalNow;
      const returnPct = capitalAtSnapshot > 0 ? (s.totalFundEquity - capitalAtSnapshot) / capitalAtSnapshot : 0;
      return { date: s.date, value: myContributed * (1 + returnPct) };
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ...summary, messages: myMessages, assetHistory });
  } catch (e) {
    res.status(500).json({ error: `Could not compute view: ${e.message}` });
  }
};
