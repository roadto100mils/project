// Stores/retrieves holdings in Upstash Redis (installed via the Vercel Marketplace),
// scoped by customer ID. customerId is hardcoded to "default" for now — once real
// customer access control is added, replace this with the authenticated customer's
// actual ID so each customer gets their own saved portfolio.

const { Redis } = require("@upstash/redis");

// Works with either naming convention Vercel/Upstash may inject depending on how
// the integration was installed.
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async function handler(req, res) {
  const customerId = "default"; // TODO: replace with authenticated customer id

  if (req.method === "GET") {
    try {
      const holdings = await redis.get(`holdings:${customerId}`);
      res.status(200).json({ holdings: holdings || null });
    } catch (e) {
      res.status(500).json({ error: `Could not read holdings: ${e.message}` });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { holdings } = req.body || {};
      if (!Array.isArray(holdings)) {
        res.status(400).json({ error: "holdings must be an array" });
        return;
      }
      await redis.set(`holdings:${customerId}`, holdings);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: `Could not save holdings: ${e.message}` });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
