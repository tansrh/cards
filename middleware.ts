import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only run for /game/* routes
  if (request.nextUrl.pathname.startsWith('/game/')) {
    const playerName = request.cookies.get('cardsPlayerName')?.value;
    if (!playerName) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/game/:path*'],
};