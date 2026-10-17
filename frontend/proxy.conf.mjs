// Development proxy for `ng serve`: only the API lives in the backend; all UI routes are handled by Angular.
const target = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000';

export default {
  '/api': { target, changeOrigin: true, secure: true },
};
