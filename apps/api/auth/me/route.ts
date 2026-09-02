import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

export async function GET(request: NextRequest) {
  try {
    const apiResponse = await fetch(`${API_URL}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie')! } : {}),
      },
    });

    const data = await apiResponse.json();
    return NextResponse.json(data, { status: apiResponse.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve session' },
      { status: 502 },
    );
  }
}
