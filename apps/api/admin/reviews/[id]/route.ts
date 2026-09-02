import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// Same pattern as the artwork reviews proxy: forwards the incoming
// admin's existing session cookie to the API so requireAdmin can verify
// them, rather than issuing a new cookie the way login does.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const cookie = request.headers.get('cookie') ?? '';

  const apiResponse = await fetch(`${API_URL}/api/v1/admin/reviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

  const data = await apiResponse.json();
  return NextResponse.json(data, { status: apiResponse.status });
}
