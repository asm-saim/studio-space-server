import { jwtVerify } from "jose";

const encoder = new TextEncoder();

/**
 * Guards every mutation. The Next.js app forwards the user's HTTPOnly-cookie
 * JWT as "Authorization: Bearer <token>". It is verified here independently
 * (signature, issuer, expiry); anything else gets a 401.
 */
export async function requireUser(req, res, next) {
  const secret = process.env.JWT_SECRET;
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!secret || !token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), {
      algorithms: ["HS256"],
      issuer: "studiospace",
    });
    if (!payload.sub) throw new Error("Token has no subject");

    req.user = {
      email: payload.sub,
      name: typeof payload.name === "string" ? payload.name : "",
      image: typeof payload.image === "string" ? payload.image : undefined,
    };
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
}