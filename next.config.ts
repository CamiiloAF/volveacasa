import type { NextConfig } from 'next';

/**
 * Las fotos viven en Supabase Storage. Habilitamos ese host en next/image para
 * que las tarjetas del listado se sirvan en WebP y en el tamaño del dispositivo:
 * mucha gente entra desde un celular con datos limitados.
 */
function supabaseHostname(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const hostname = supabaseHostname();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: hostname
      ? [{ protocol: 'https', hostname, pathname: '/storage/v1/object/public/**' }]
      : [],
    formats: ['image/webp'],
  },
};

export default nextConfig;
