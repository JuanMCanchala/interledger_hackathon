/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:3000";

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/onboard.html",
        destination: `${backendUrl}/onboard.html`,
      },
      {
        source: "/merchant.html",
        destination: `${backendUrl}/merchant.html`,
      },
      {
        source: "/pay.html",
        destination: `${backendUrl}/pay.html`,
      },
      {
        source: "/sandbox.html",
        destination: `${backendUrl}/sandbox.html`,
      },
      {
        source: "/styles.css",
        destination: `${backendUrl}/styles.css`,
      },
      {
        source: "/app.js",
        destination: `${backendUrl}/app.js`,
      },
      {
        source: "/js/:path*",
        destination: `${backendUrl}/js/:path*`,
      },
    ];
  },
};

export default nextConfig;
