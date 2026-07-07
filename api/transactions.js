// Stores/retrieves the full buy/sell transaction log (every add-position and every
// close, partial or full). Separate from closedPositions, which tracks only sell
// events with realized P&L for the Return calculation — this is the full audit trail.
//
// Protected by the same admin password as holdings/investors.

const { Redis } = require("@upstash/redis");
const { checkAdminAuth } = require("./_lib/adminAuth");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

module.exports = async function handler(req, res) {
  if (!checkAdminAuth(req, res)) return;

  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({ error: "Redis environment variables not found" });
    return;
  }

  if (req.method === "GET") {
    try {
      const transactions = await redis.get("transactions");
      res.status(200).json({ transactions: transactions || [] });
    } catch (e) {
      res.status(500).json({ error: `Could not read transactions: ${e.message}` });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { transactions } = req.body || {};
      if (!Array.isArray(transactions)) {
        res.status(400).json({ error: "transactions must be an array" });
        return;
      }
      await redis.set("transactions", transactions);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: `Could not save transactions: ${e.message}` });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
