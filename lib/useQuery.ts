'use client';
import {useSearchParams} from 'next/navigation';

/**
 * Null-safe wrapper around useSearchParams().
 * Because this project also has a `pages/` directory, Next.js types
 * useSearchParams() as `ReadonlyURLSearchParams | null`. Always read query
 * parameters through this hook so the build can never fail on that again.
 * Components using it must be wrapped in <Suspense>.
 */
export function useQueryParam(name: string): string | null {
  const params = useSearchParams();
  return params?.get(name) ?? null;
}
