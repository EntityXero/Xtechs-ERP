import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware — runs on the Edge before page rendering.
 *
 * Handles auth redirect logic at the routing level:
 * - Unauthenticated users visiting workspace routes → /login
 * - Authenticated users visiting /login → /
 *
 * Cookie presence check only (lightweight) — the AuthGuard component
 * does a full server-side session verification via /api/v1/auth/me.
 */

const PUBLIC_PATHS = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the access_token cookie is present (not verified — just a presence check)
  const hasSessionCookie = request.cookies.has('access_token');

  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Redirect unauthenticated users to login (except public paths and static files)
  if (!hasSessionCookie && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from login back to workspace
  if (hasSessionCookie && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (Next.js image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - Public API routes
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
