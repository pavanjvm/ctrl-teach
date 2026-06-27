/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Excalidraw uses dynamic imports with no SSR
  transpilePackages: ["@excalidraw/excalidraw"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
};

module.exports = nextConfig;
