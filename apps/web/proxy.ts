import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js 16 requires the exported function to be named 'proxy' or 'default'
export function proxy(request: NextRequest) {
  // Your routing / guard logic here
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
