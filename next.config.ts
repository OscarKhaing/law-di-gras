import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Clio's OAuth redirect has to be registered as http://127.0.0.1, so the dev server is opened there too.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
