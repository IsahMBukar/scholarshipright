/** @type {import('next').NextConfig} */
const nextConfig = {
  // three.js + react-three-fiber ship ESM that Next's bundler can choke on
  // without transpilation. This is the officially recommended fix for R3F
  // in the App Router.
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],

  // NOTE on the previous /api/:path* rewrite:
  // It hardcoded http://localhost:8000, which would silently break any
  // deployment that wasn't the dev box. We removed it and instead rely on
  // `NEXT_PUBLIC_API_URL` (the constant `API_URL` in src/services/api.ts
  // and its mirrors in the auth pages). The browser will call the backend
  // directly. CORS is already configured on the backend (see
  // backend/app/main.py -> CORSMiddleware.allow_origins) to accept the
  // frontend's origin in any environment, as long as FRONTEND_URL is
  // set correctly in the backend .env.
};

module.exports = nextConfig;
