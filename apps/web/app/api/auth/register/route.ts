import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const apiResponse = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await apiResponse.json();
    const response = NextResponse.json(data, { status: apiResponse.status });

    // Extract raw Set-Cookie headers from Express
    const setCookieHeaders = apiResponse.headers.getSetCookie?.() ?? [];

    for (const cookieString of setCookieHeaders) {
      // Split cookie string to parse flags safely
      const [cookiePair, ...flags] = cookieString.split(';');
      const [name, ...valueParts] = cookiePair.split('=');
      const value = valueParts.join('=');

      if (name && value) {
        response.cookies.set({
          name: name.trim(),
          value: value.trim(),
          httpOnly: cookieString.toLowerCase().includes('httponly'),
          sameSite: 'lax',
          path: '/',
          secure: process.env.NODE_ENV === 'production',
        });
      }
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to connect to backend server' },
      { status: 502 },
    );
  }
}
