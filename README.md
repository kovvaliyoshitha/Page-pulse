# Page Pulse

A small tool that audits any URL: fetches the page and reports HTTP status,
response time, title, meta description, H1 count, image alt-text coverage,
and an approximate word count. Built with a plain Express backend and a
single static HTML/JS frontend no build step, no framework overhead.

Live demo: https://page-pulse.bonto.run/
## Setup

```bash
npm install
npm start        # serves the app on http://localhost:3000
npm test         # runs the test suite
```

Requires Node 18+ (uses the built-in global `fetch` and `AbortController`
no `node-fetch` dependency needed).

## API contract

**POST `/api/audit`**

Request body:
```json
{ "url": "https://example.com" }
```

Success response — `200 OK`:
```json
{
  "url": "https://example.com",
  "httpStatus": 200,
  "responseTimeMs": 214,
  "title": "Example Domain",
  "metaDescription": null,
  "h1Count": 1,
  "images": { "total": 3, "missingAlt": 1 },
  "approxWordCount": 187
}
```

Error responses all return `{ "error": "<code>", "message": "<human-readable>" }`:

| Status | error code           | When |
|--------|----------------------|------|
| 400    | `invalid_url`        | Missing URL or not a well-formed http(s) URL |
| 415    | `non_html_response`  | Content-Type isn't `text/html` (e.g. a JSON API, a PDF) |
| 502    | `fetch_failed`       | Network error, DNS failure, connection refused |
| 502    | `read_failed`        | Connected fine, but the body stream failed while reading |
| 504    | `timeout`            | No response within 8 seconds |
| 500    | `parse_failed`       | Fetched successfully but the HTML couldn't be parsed |

The server never throws an uncaught exception for a bad target URL every
failure path returns a structured JSON error instead of crashing the process.

## Design decisions

**1. Validate the URL before touching the network, not after.**
`isValidUrl()` runs first and rejects anything that isn't a well-formed
`http(s)` URL with a `400` immediately. This keeps "user typo" cheap and
distinct from "the target server is unreachable" the two failure modes
have very different meanings and shouldn't share a status code or message.

**2. A hard timeout via `AbortController`, not a `Promise.race`.**
A dead or slow server can hang a request indefinitely. Using `fetch`'s own
`signal` to abort the underlying connection (rather than racing a timer
against the fetch promise) actually tears down the socket instead of just
abandoning the promise while the connection stays open in the background
cleaner for a tool that might get hit with many concurrent audits.

**3. Content-type check happens before reading/parsing the body.**
If someone points the tool at a JSON API or a PDF, there's no point trying
to run Cheerio over it. Checking `content-type` first and returning `415`
avoids wasted work and gives a clearer error than "found 0 of everything."

## Self-critique

The word count is the weakest part of the implementation: `$('body').text()`
pulls in text from `<script>` and `<style>` tags that happen to sit inside
`body`, which can inflate the count on pages with inline scripts. Given
another day, I'd strip `script`/`style`/`noscript` nodes before extracting
text, and probably also exclude nav/footer boilerplate so the count reflects
actual page content rather than everything technically visible in the DOM.

## Where AI was used

Used Claude to scaffold the Express route structure and the Jest/Supertest
test file, and to sanity-check the timeout/abort approach against
alternatives. The error-handling design (which failure gets which status
code, checking content-type before parsing) and the self-critique above are
my own calls, made after trying a version that parsed first and handled
errors as an afterthought, that version's error messages were much less
useful, which is what pushed me toward validating in the order shown above.

## Not included here

Deploying this Render, pushing it to a public GitHub
repo, and recording a walkthrough are steps you'd do yourself outside this
codebase. I can't create live deployments or video recordings.
