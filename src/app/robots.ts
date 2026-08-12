import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
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
