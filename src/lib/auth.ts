// Minimal gate for internal pages and APIs (simulator, approvals).
// Set ADMIN_PASSWORD in the environment; requests send it as x-admin-password.
export function isAdmin(req: Request) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return process.env.NODE_ENV !== "production"; // open locally, locked in prod until set
  return req.headers.get("x-admin-password") === pw;
}
