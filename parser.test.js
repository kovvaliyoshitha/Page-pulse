const { analyzeHtml, isValidUrl, app } = require('../server');
const request = require('supertest');

describe('isValidUrl', () => {
  test('accepts http and https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://example.com/page')).toBe(true);
  });

  test('rejects malformed or non-http(s) input', () => {
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

describe('analyzeHtml (parsing logic)', () => {
  test('happy path: extracts title, meta description, H1s, image alt coverage, word count', () => {
    const html = `
      <html>
        <head>
          <title>  Example Page  </title>
          <meta name="description" content="A short description" />
        </head>
        <body>
          <h1>Welcome</h1>
          <h1>Second heading</h1>
          <img src="a.png" alt="a photo" />
          <img src="b.png" />
          <p>Some visible body text here for counting words.</p>
        </body>
      </html>
    `;
    const result = analyzeHtml(html);
    expect(result.title).toBe('Example Page');
    expect(result.metaDescription).toBe('A short description');
    expect(result.h1Count).toBe(2);
    expect(result.images).toEqual({ total: 2, missingAlt: 1 });
    expect(result.approxWordCount).toBeGreaterThan(0);
  });

  test('failure case: page missing title/meta/H1/images returns safe defaults, no crash', () => {
    const html = '<html><head></head><body><p>Just text.</p></body></html>';
    const result = analyzeHtml(html);
    expect(result.title).toBeNull();
    expect(result.metaDescription).toBeNull();
    expect(result.h1Count).toBe(0);
    expect(result.images).toEqual({ total: 0, missingAlt: 0 });
  });
});

describe('POST /api/audit (endpoint-level failure handling)', () => {
  afterEach(() => {
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
  });

  test('failure case: invalid URL returns 400 without calling fetch', async () => {
    const res = await request(app).post('/api/audit').send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_url');
  });

  test('failure case: non-HTML response returns 415, not a crash', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => '{}',
    });

    const res = await request(app).post('/api/audit').send({ url: 'https://example.com/data.json' });
    expect(res.status).toBe(415);
    expect(res.body.error).toBe('non_html_response');
  });
});
