// Automatically records today's fund equity snapshot once a day, triggered by
// Vercel Cron (see vercel.json) — no admin login required. This is what lets the
// trend chart (and each customer's asset chart) keep accumulating data even on
// days nobody opens the dashboard.
//
// Protected by CRON_SECRET rather than the admin password, since Vercel Cron calls
// this directly and can't go through the browser-based admin login flow. Vercel
// automatically sends "Authorization: Bearer <CRON_SECRET>" when a CRON_SECRET
// environment variable is set on the project.

const { Redis } = require("@upstash/redis");
const { fetchUsQuotes, fetchKlseQuotes, fetchFxRate } = require("./_lib/market");
const { computeFundEquity } = require("./_lib/fundCalc");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

module.exports = async function handler(req, res) {
  const CRON_SECRET = process.env.CRON_SECRET;
  if (CRON_SECRET) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({ error: "Redis environment variables not found" });
    return;
  }

  try {
    const [holdings, investors, closedPositions] = await Promise.all([
      redis.get("holdings:default"),
      redis.get("investors"),
      redis.get("closedPositions"),
    ]);
    const holdingsList = holdings || [];
    const investorList = investors || [];

    const usSymbols = holdingsList.filter((h) => h.exchange === "US").map((h) => h.symbol);
    const klseSymbols = holdingsList.filter((h) => h.exchange === "KLSE").map((h) => h.symbol);
    const [usQ, klseQ, fx] = await Promise.all([
      fetchUsQuotes(usSymbols),
      fetchKlseQuotes(klseSymbols),
      fetchFxRate(),
    ]);
    const fxRate = fx || 4.7;

    const { totalCapitalMYR, cashMYR, openValueMYR, totalFundEquity } = computeFundEquity(
      investorList,
      holdingsList,
      closedPositions || [],
      usQ.result,
      klseQ.result,
      fxRate
    );

    const today = new Date().toISOString().slice(0, 10);
    const existing = (await redis.get("snapshots")) || [];
    const withoutToday = existing.filter((s) => s.date !== today);
    const updated = [
      ...withoutToday,
      { date: today, totalFundEquity, totalValue: openValueMYR, cash: cashMYR, totalCapital: totalCapitalMYR },
    ].sort((a, b) => a.date.localeCompare(b.date));
    await redis.set("snapshots", updated);

    res.status(200).json({ ok: true, date: today, totalFundEquity });
  } catch (e) {
    res.status(500).json({ error: `Could not record snapshot: ${e.message}` });
  }
};
