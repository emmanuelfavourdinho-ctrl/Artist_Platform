import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

export async function POST() {
  try {
    const apiResponse = await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: 'POST',
    });

    const data = await apiResponse.json();
    const response = NextResponse.json(data, { status: apiResponse.status });

    // Forward expired/cleared session cookie header to client
    const setCookieHeaders = apiResponse.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookieHeaders) {
      response.headers.append('Set-Cookie', cookie);
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to connect to backend server' },
      { status: 502 },
    );
  }
}
