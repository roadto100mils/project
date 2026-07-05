// Simple shared password gate for admin-only endpoints (holdings, investors).
// Not full authentication — just a single shared password, checked against the
// ADMIN_PASSWORD environment variable. Good enough to stop casual/opportunistic
// access to your admin dashboard; not bank-grade security.

function checkAdminAuth(req, res) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ error: "ADMIN_PASSWORD not configured on server" });
    return false;
  }
  const provided = req.headers["x-admin-password"];
  if (provided !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Incorrect or missing admin password" });
    return false;
  }
  return true;
}

module.exports = { checkAdminAuth };
