/* Route-level loading state. Branded spinner (no plain "Loading..." text). */

import { BrandedLoader } from '@/components/BrandedLoader';

export default function Loading() {
  return <BrandedLoader surface="app" />;
}
