import { NextRequest, NextResponse } from 'next/server';

// Node runtime required: Edge's fetch implementation doesn't reliably
// support getSetCookie(), which this route depends on to forward the
// API's session cookie to the browser.
export const runtime = 'nodejs';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const apiResponse = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await apiResponse.json();
  const response = NextResponse.json(data, { status: apiResponse.status });

  // Forward every Set-Cookie header from the API verbatim. The browser
  // never talks to the API directly — only to this Next.js route — so
  // without this the API's session cookie would be received by the
  // Next.js server and then silently dropped, never reaching the client.
  const setCookieHeaders = apiResponse.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookieHeaders) {
    response.headers.append('Set-Cookie', cookie);
  }

  return response;
}
