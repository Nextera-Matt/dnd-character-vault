import type { NextConfig } from "next";

const exporting = process.env.NEXT_EXPORT === "1";

const nextConfig: NextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  ...(exporting
    ? { output: "export" as const }
    : {
        async rewrites() {
          return [
            { source: "/api/:path*", destination: "http://127.0.0.1:3000/api/:path*" },
          ];
        },
      }),
};

export default nextConfig;
