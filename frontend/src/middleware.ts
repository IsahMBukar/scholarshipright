// Next.js middleware — server-side route protection.
//
// Strategy: "discovery vs productivity"
//   - Discovery routes (scholarships) are fully public
//   - Productivity routes (resume, saved, chat, etc.) redirect to /login
//   - Auth pages (login, signup) redirect to /scholarships if already logged in
//
// We check for the `sr_token` cookie (set by the backend on login).
// If present, the user is considered authenticated.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication (productivity features)
const PROTECTED_ROUTES = [
  '/resume',
  '/profile',
  '/saved',
  '/settings',
  '/chat',
  '/coaching',
  '/interview',
  '/onboarding',
];

// Routes that should redirect to /scholarships if already authenticated
const AUTH_ROUTES = ['/login', '/signup'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = request.cookies.has('sr_token');

  // Check if the current path is a protected route
  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  // Check if the current path is an auth route
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  // Protected route + no token → redirect to /login with return URL
  if (isProtected && !hasToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Auth route + already has token → redirect to /scholarships
  if (isAuthRoute && hasToken) {
    return NextResponse.redirect(new URL('/scholarships', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static files, api routes, and _next
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|images/).*)',
  ],
};
