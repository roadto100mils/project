// Stores/retrieves the list of investors (customers) and how much each has contributed.
// Used by the admin dashboard to manage customers, and by customer-login.js to compute
// each customer's share of the fund.
//
// Protected by a shared admin password — this data includes customer usernames and
// passwords, so it must never be readable without authentication.

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
      const investors = await redis.get("investors");
      res.status(200).json({ investors: investors || [] });
    } catch (e) {
      res.status(500).json({ error: `Could not read investors: ${e.message}` });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { investors } = req.body || {};
      if (!Array.isArray(investors)) {
        res.status(400).json({ error: "investors must be an array" });
        return;
      }
      await redis.set("investors", investors);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: `Could not save investors: ${e.message}` });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
