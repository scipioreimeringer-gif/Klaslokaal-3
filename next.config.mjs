// Build info baked in at build time, so every page can show which branch/commit it runs.
// On Vercel these system variables are always set during the build; locally they fall back to "lokaal".
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || 'lokaal').slice(0, 7),
    NEXT_PUBLIC_BUILD_REF: process.env.VERCEL_GIT_COMMIT_REF || 'lokaal',
    NEXT_PUBLIC_BUILD_ENV: process.env.VERCEL_ENV || 'development',
  },
};
export default nextConfig;
