// Development proxy for `ng serve`: everything that is not the landing lives in the backend
// (the API, the wallet consent callbacks and the till, onboarding, checkout and sandbox pages).
// Production does the same with nginx (nginx.conf.template). Keep both lists in sync.
const target = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000';

const BACKEND_PATHS = [
  '/api',
  '/js',
  '/onboard.html',
  '/merchant.html',
  '/pay.html',
  '/sandbox.html',
  '/styles.css',
  '/app.js',
  '/favicon.svg',
];

export default Object.fromEntries(
  BACKEND_PATHS.map((path) => [path, { target, changeOrigin: true, secure: true }]),
);
