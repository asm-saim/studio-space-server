import { timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function decode(value) {
  try {
    return decodeURIComponent(value ?? "");
  } catch {
    return "";
  }
}

/**
 * Guards every mutation. The Next.js app verifies the BetterAuth session
 * cookie, then calls this API with a shared secret and the verified user.
 * Anything without the secret gets a 401.
 */
export function requireUser(req, res, next) {
  const expected = process.env.INTERNAL_API_KEY;
  const key = req.get("x-internal-key");
  const email = req.get("x-user-email");

  if (!expected || !key || !email || !safeEqual(key, expected)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  req.user = {
    email,
    name: decode(req.get("x-user-name")),
    image: decode(req.get("x-user-image")) || undefined,
  };
  next();
}