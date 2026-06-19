/** @type {import('next').NextConfig} */
const nextConfig = {
  // three.js + react-three-fiber ship ESM that Next's bundler can choke on
  // without transpilation. This is the officially recommended fix for R3F
  // in the App Router.
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
