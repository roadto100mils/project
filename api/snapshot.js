// Stores daily snapshots of total fund equity, used to draw the historical trend chart.
// A snapshot is recorded (or updated) for "today" whenever the admin dashboard loads —
// no cron job needed, but this means a day with zero visits won't have a data point.
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
      const snapshots = await redis.get("snapshots");
      res.status(200).json({ snapshots: snapshots || [] });
    } catch (e) {
      res.status(500).json({ error: `Could not read snapshots: ${e.message}` });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { date, totalFundEquity, totalValue, cash, totalCapital } = req.body || {};
      if (!date || typeof totalFundEquity !== "number") {
        res.status(400).json({ error: "date and totalFundEquity are required" });
        return;
      }
      const existing = (await redis.get("snapshots")) || [];
      const withoutToday = existing.filter((s) => s.date !== date);
      const updated = [...withoutToday, { date, totalFundEquity, totalValue, cash, totalCapital }].sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      await redis.set("snapshots", updated);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: `Could not save snapshot: ${e.message}` });
    }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const { date } = req.body || {};
      if (date) {
        // Delete one specific data point
        const existing = (await redis.get("snapshots")) || [];
        const updated = existing.filter((s) => s.date !== date);
        await redis.set("snapshots", updated);
      } else {
        // No date given: clear everything
        await redis.set("snapshots", []);
      }
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: `Could not delete snapshot(s): ${e.message}` });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
