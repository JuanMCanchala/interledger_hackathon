// Development proxy for `ng serve`: everything that is not the landing lives in the backend
// (the API, the wallet consent callbacks and the till, onboarding, checkout and sandbox pages).
// Production does the same with nginx (nginx.conf.template). Keep both lists in sync, and with the
// navigationUrls of ngsw-config.json, or the service worker answers these pages with the landing.
const target = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000';

// Backend assets live under /css and /js, never at the root: `ng serve` publishes its own
// /styles.css and would shadow a backend file with the same name.
const BACKEND_PATHS = [
  '/api',
  '/css',
  '/js',
  '/img',
  // Clean page URLs (/onboard, /onboard/) and the old .html links, which the backend redirects.
  '/login',
  '/register',
  '/onboard',
  '/merchant',
  '/pay',
  '/cobro',
  '/sandbox',
  '/favicon.svg',
];

export default Object.fromEntries(
  BACKEND_PATHS.map((path) => [path, { target, changeOrigin: true, secure: true }]),
);
