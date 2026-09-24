import type { MetadataRoute } from "next";
import { CANONICAL_BASE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/auth/",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/teachers/",
        "/teachers-v2/",
      ],
    },
    sitemap: `${CANONICAL_BASE_URL}/sitemap.xml`,
  };
}
