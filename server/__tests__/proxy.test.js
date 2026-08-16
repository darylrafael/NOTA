const request = require('supertest');
const app = require('../index');

describe('NOTA V2 Proxy Server Integration Tests', () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Security & Validation', () => {
    it('should reject requests without a base64Image', async () => {
      const res = await request(app)
        .post('/api/extract')
        .set('x-device-id', 'test-device-123')
        .send({});
      
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('base64Image is required');
    });

    it('should reject requests without an x-device-id header', async () => {
      const res = await request(app)
        .post('/api/extract')
        .send({ base64Image: 'fake-image-data' });
      
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
    // Note: To fully mock fetch we could use jest.spyOn(global, 'fetch')
    // but in this test suite we will just let it fail gracefully against the real endpoint
    // with our fake 'test-key', which should return 400 API key not valid.
    
    it('should handle Gemini API errors gracefully (400 Invalid Key)', async () => {
      const res = await request(app)
        .post('/api/extract')
        .set('x-device-id', 'test-device-123')
        .send({ base64Image: 'base64-fake' });
      
      // Since our key is invalid, Google returns 400
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Gemini API Error');
    });
  });
});
