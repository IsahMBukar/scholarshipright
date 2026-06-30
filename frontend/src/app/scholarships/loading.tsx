/* Route-level loading state. Branded structural skeleton. */

import { SkeletonPage } from '@/components/BrandedLoader';

export default function Loading() {
  return <SkeletonPage variant="list" surface="app" />;
}
