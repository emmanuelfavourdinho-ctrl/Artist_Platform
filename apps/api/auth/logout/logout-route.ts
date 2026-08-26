import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function POST() {
  const apiResponse = await fetch(`${API_URL}/api/v1/auth/logout`, {
    method: 'POST',
  });

  const data = await apiResponse.json();
  const response = NextResponse.json(data, { status: apiResponse.status });

  const setCookieHeaders = apiResponse.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookieHeaders) {
    response.headers.append('Set-Cookie', cookie);
  }

  return response;
}
