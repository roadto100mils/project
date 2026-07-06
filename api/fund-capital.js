// Stores/retrieves the total fund capital (total money available, including what's
// already invested in holdings). Used to compute remaining cash: totalCapital minus
// the cost basis of current holdings.
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
      const totalCapital = await redis.get("fundCapital");
      res.status(200).json({ totalCapital: totalCapital || 0 });
    } catch (e) {
      res.status(500).json({ error: `Could not read fund capital: ${e.message}` });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { totalCapital } = req.body || {};
      if (typeof totalCapital !== "number") {
        res.status(400).json({ error: "totalCapital must be a number" });
        return;
      }
      await redis.set("fundCapital", totalCapital);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: `Could not save fund capital: ${e.message}` });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
