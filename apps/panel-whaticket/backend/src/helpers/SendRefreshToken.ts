import { Response } from "express";

export const SendRefreshToken = (res: Response, token: string): void => {
  // In production the panel frontend and backend are usually on different domains.
  // Modern browsers block cross-site cookies unless SameSite=None + Secure.
  const prod =
    String(process.env.NODE_ENV || "").toLowerCase() === "production" ||
    String(process.env.BACKEND_URL || "").startsWith("https://") ||
    String(process.env.PUBLIC_URL || "").startsWith("https://") ||
    String(process.env.API_URL || "").startsWith("https://");

  res.cookie("jrt", token, {
    httpOnly: true,
    path: "/",
    sameSite: prod ? "none" : "lax",
    secure: prod
  });
};
