const express = require('express');
const cheerio = require('cheerio');
const { performance } = require('perf_hooks');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TIMEOUT_MS = 8000;

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timeout);
  }
}

function analyzeHtml(html) {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr('content') || null;
  const h1Count = $('h1').length;

  const images = $('img');
  let missingAlt = 0;
  images.each((_, el) => {
    const alt = $(el).attr('alt');
    if (!alt || !alt.trim()) missingAlt++;
  });

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const approxWordCount = bodyText.length ? bodyText.split(' ').length : 0;

  return {
    title,
    metaDescription,
    h1Count,
    images: { total: images.length, missingAlt },
    approxWordCount,
  };
}

app.post('/api/audit', async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string' || !isValidUrl(url)) {
    return res.status(400).json({
      error: 'invalid_url',
      message: 'Please provide a valid absolute URL starting with http:// or https://',
    });
  }

  const start = performance.now();
  let response;
  try {
    response = await fetchWithTimeout(url, TIMEOUT_MS);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({
        error: 'timeout',
        message: `The page did not respond within ${TIMEOUT_MS / 1000}s.`,
      });
    }
    return res.status(502).json({
      error: 'fetch_failed',
      message: 'Could not reach that URL. It may be down, invalid, or blocking requests.',
    });
  }
  const responseTimeMs = Math.round(performance.now() - start);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return res.status(415).json({
      error: 'non_html_response',
      message: `Expected an HTML page but got content-type "${contentType || 'unknown'}".`,
      httpStatus: response.status,
      responseTimeMs,
    });
  }

  let html;
  try {
    html = await response.text();
  } catch {
    return res.status(502).json({
      error: 'read_failed',
      message: 'Fetched the page but could not read its body.',
    });
  }

  let report;
  try {
    report = analyzeHtml(html);
  } catch {
    return res.status(500).json({
      error: 'parse_failed',
      message: 'The page fetched successfully but could not be parsed.',
    });
  }

  return res.json({
    url,
    httpStatus: response.status,
    responseTimeMs,
    ...report,
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Page Pulse listening on :${PORT}`));
}

module.exports = { app, analyzeHtml, isValidUrl };
