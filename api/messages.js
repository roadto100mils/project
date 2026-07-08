// Stores/retrieves messages sent to investors — either broadcast to all customers or
// targeted at a specific one. Files are stored as base64 data URLs directly in Redis
// for simplicity (no separate file storage service needed); keep attachments small
// (a few MB) since Upstash free-tier storage is limited.
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
      const messages = await redis.get("messages");
      res.status(200).json({ messages: messages || [] });
    } catch (e) {
      res.status(500).json({ error: `Could not read messages: ${e.message}` });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { messages } = req.body || {};
      if (!Array.isArray(messages)) {
        res.status(400).json({ error: "messages must be an array" });
        return;
      }
      await redis.set("messages", messages);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: `Could not save messages: ${e.message}` });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
