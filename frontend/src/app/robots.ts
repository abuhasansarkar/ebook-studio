import type { MetadataRoute } from "next";

/**
 * The robots policy.
 *
 * The studio is private and is disallowed outright, so a crawler does not
 * spend its budget on pages that need a session.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app/", "/api/", "/verify-email", "/reset-password"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
