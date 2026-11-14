import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The local `claude` CLI and the file store need the Node.js runtime.
  serverExternalPackages: [],
  // drei <Html> overlays create their own React roots; StrictMode's dev double-mount races them
  // ("synchronously unmount a root while React was already rendering") and can drop a nameplate.
  reactStrictMode: false,
  images: { unoptimized: true },
};

export default nextConfig;
