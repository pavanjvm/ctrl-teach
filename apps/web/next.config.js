const isDevelopment = process.env.NODE_ENV !== "production";
const cspOrigin = (value, fallback) => {
  try {
    return new URL(value || fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
};
const apiOrigin = cspOrigin(process.env.NEXT_PUBLIC_API_URL, "http://localhost:8000");
const dailyCallMachineOrigin = "https://c.daily.co";
// Daily WebRTC signaling/media endpoints used by call-object mode.
const dailyConnectSource = "https://*.daily.co";
const dailyWebsocketSource = "wss://*.daily.co";
const tavusMediaOrigin = "https://cdn.replica.tavus.io";
const connectSources = new Set([
  "'self'",
  apiOrigin,
  cspOrigin(process.env.NEXT_PUBLIC_WS_URL, "ws://localhost:8000"),
  "https://www.gstatic.com",
  dailyConnectSource,
  dailyWebsocketSource,
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
  // daily-js loads its call machine from c.daily.co and executes part of it in
  // a blob worker. Both sources are required before call.join() can resolve.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: ${dailyCallMachineOrigin}${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${apiOrigin}`,
  "font-src 'self' data:",
  `media-src 'self' data: blob: https://www.gstatic.com ${tavusMediaOrigin}`,
  `connect-src ${Array.from(connectSources).join(" ")}`,
  `worker-src 'self' blob: ${dailyCallMachineOrigin}`,
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
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
            // Call-object media elements and the separate OpenAI microphone
            // capture both run in this page; no cross-origin frame needs access.
            value: "camera=(self), microphone=(self), autoplay=(self), display-capture=(self), geolocation=(), payment=(), usb=()",
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
