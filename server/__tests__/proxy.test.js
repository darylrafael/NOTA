const request = require('supertest');
const app = require('../index');

describe('NOTA V2 Proxy Server Integration Tests', () => {
  let originalEnv;
  let originalFetch;

  beforeAll(() => {
    originalEnv = { ...process.env };
    originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  describe('Security & Validation', () => {
    it('should reject requests without a base64Image', async () => {
      const res = await request(app)
        .post('/api/extract')
        .set('x-device-id', 'test-device-123')
        .send({});
      
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('base64Image must be a non-empty base64 string');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject a non-string base64Image without using a scan quota', async () => {
      const res = await request(app)
        .post('/api/extract')
        .set('x-device-id', 'test-device-invalid-image')
        .send({ base64Image: { image: 'not-a-string' } });

      expect(res.statusCode).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject requests without an x-device-id header', async () => {
      const res = await request(app)
        .post('/api/extract')
        .send({ base64Image: 'ZmFrZS1pbWFnZS1kYXRh' });
      
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Missing device identifier');
    });

    it('should enforce payload size limits (reject > 2mb)', async () => {
      // Create a payload > 2MB
      const largeString = 'A'.repeat(2.5 * 1024 * 1024);
      const res = await request(app)
        .post('/api/extract')
        .set('x-device-id', 'test-device-123')
        .send({ base64Image: largeString });
      
      expect(res.statusCode).toBe(413); // Payload Too Large
    });
  });

  describe('Upstream AI Handling', () => {
    it('should handle Gemini API errors gracefully (400 Invalid Key)', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid API key',
      });

      const res = await request(app)
        .post('/api/extract')
        .set('x-device-id', 'test-device-123')
        .send({ base64Image: 'ZmFrZS1pbWFnZQ==' });
      
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Gemini API Error');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
