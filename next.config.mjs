const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  output: "standalone",
  poweredByHeader: false,
  trailingSlash: true,
};

export default nextConfig;
