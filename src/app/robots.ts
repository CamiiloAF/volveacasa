import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Los links de gestión llevan el token en la URL.
        disallow: ['/gestionar/', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
