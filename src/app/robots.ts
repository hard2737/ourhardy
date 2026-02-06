import type { MetadataRoute } from "next";

/**
 * Dynamic robots.txt for Vercel/Next.js.
 * Served at /robots.txt. Cached by default (no dynamic APIs).
 *
 * Full options (Robots spec + Next.js MetadataRoute.Robots):
 *
 * 1. rules (required for directive output)
 *    - userAgent: string | string[]
 *      e.g. "*" (all), "Googlebot", "Bingbot", "Applebot", ["Googlebot", "Googlebot-Image"]
 *    - allow: string | string[]
 *      Paths crawlers MAY access (e.g. "/", "/public/", "/blog/")
 *    - disallow: string | string[]
 *      Paths crawlers must NOT access (e.g. "/api/", "/admin/", "/private/")
 *    - crawlDelay?: number
 *      Seconds between requests (Yandex; Google ignores it)
 *
 * 2. sitemap?: string | string[]
 *    Absolute URL(s) to sitemap(s), e.g. "https://yoursite.com/sitemap.xml"
 *
 * 3. host?: string
 *    Preferred canonical host (mainly Yandex), e.g. "https://www.yoursite.com"
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://app.ourhardy.com");

  return {
    rules: [
      // Default: all crawlers
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/_next/",
          "/private/",
          // "/admin/",
          // "/dashboard/",
        ],
      },
      // Optional: stricter rules for specific bots (uncomment to use)
      // {
      //   userAgent: ["Googlebot", "Googlebot-Image"],
      //   allow: ["/", "/blog/", "/images/"],
      //   disallow: ["/api/", "/admin/", "/_next/"],
      // },
      // {
      //   userAgent: "Bingbot",
      //   allow: "/",
      //   disallow: ["/api/", "/admin/"],
      // },
      // crawlDelay (Yandex only; Google ignores)
      // { userAgent: "Yandex", allow: "/", disallow: "/api/", crawlDelay: 1 },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    // host: baseUrl, // optional, mainly for Yandex
  };
}
