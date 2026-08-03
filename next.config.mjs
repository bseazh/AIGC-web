const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  generateBuildId: async () => null,
  output: "standalone",
  poweredByHeader: false,
  trailingSlash: true,
  typescript: {
    tsconfigPath: "tsconfig.json",
  },
};

export default nextConfig;
