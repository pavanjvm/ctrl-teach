const isDevelopment = process.env.NODE_ENV !== "production";
const cspOrigin = (value, fallback) => {
  try {
    return new URL(value || fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
};
const apiOrigin = cspOrigin(process.env.NEXT_PUBLIC_API_URL, "http://localhost:8000");
const connectSources = new Set([
  "'self'",
  apiOrigin,
  cspOrigin(process.env.NEXT_PUBLIC_WS_URL, "ws://localhost:8000"),
  "https://www.gstatic.com",
]);
if (isDevelopment) {
  connectSources.add("http://localhost:*");
  connectSources.add("http://127.0.0.1:*");
  connectSources.add("ws://localhost:*");
  connectSources.add("ws://127.0.0.1:*");
}
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${apiOrigin}`,
  "font-src 'self' data:",
  "media-src 'self' data: blob: https://www.gstatic.com",
  `connect-src ${Array.from(connectSources).join(" ")}`,
  "worker-src 'self' blob:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
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
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
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
