// Stores/retrieves the history of closed positions (realized trades).
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
      const closedPositions = await redis.get("closedPositions");
      res.status(200).json({ closedPositions: closedPositions || [] });
    } catch (e) {
      res.status(500).json({ error: `Could not read history: ${e.message}` });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { closedPositions } = req.body || {};
      if (!Array.isArray(closedPositions)) {
        res.status(400).json({ error: "closedPositions must be an array" });
        return;
      }
      await redis.set("closedPositions", closedPositions);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: `Could not save history: ${e.message}` });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
