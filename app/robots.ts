import type { MetadataRoute } from "next";

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
    sitemap: "https://nanosyllabus.com/sitemap.xml",
  };
}
