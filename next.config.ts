import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages that should not be bundled by webpack/turbopack.
  serverExternalPackages: [],
};

export default nextConfig;

// Enable calling getCloudflareContext() during `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
