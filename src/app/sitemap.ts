import type { MetadataRoute } from 'next';

import { adminClient } from '@/lib/supabase';

export const revalidate = 3600;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/buscar`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/publicar`, changeFrequency: 'monthly', priority: 0.8 },
  ];

  try {
    const { data } = await adminClient()
      .from('pets')
      .select('slug, updated_at')
      .order('created_at', { ascending: false })
      .limit(5000);

    return [
      ...staticRoutes,
      ...(data ?? []).map((pet: { slug: string; updated_at: string }) => ({
        url: `${base}/mascota/${pet.slug}`,
        lastModified: new Date(pet.updated_at),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      })),
    ];
  } catch {
    // Sin base de datos configurada el sitemap igual debe responder.
    return staticRoutes;
  }
}
