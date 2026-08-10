import request from 'supertest';
import { app } from '../app.js';

describe('Health endpoint', () => {
  it('returns status 200 and a JSON payload', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
      }),
    );
  });
});
