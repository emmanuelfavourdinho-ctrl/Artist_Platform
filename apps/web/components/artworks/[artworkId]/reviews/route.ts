import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// Different from login/register's proxies: this forwards the INCOMING
// request's cookie to the API, rather than issuing a new one — the
// browser already has a session cookie from a prior login, and the
// backend's requireAuth needs to see it to know who's submitting.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ artworkId: string }> },
) {
  const { artworkId } = await params;
  const body = await request.json();
  const cookie = request.headers.get('cookie') ?? '';

  const apiResponse = await fetch(`${API_URL}/api/v1/artworks/${artworkId}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

  const data = await apiResponse.json();
  return NextResponse.json(data, { status: apiResponse.status });
}
