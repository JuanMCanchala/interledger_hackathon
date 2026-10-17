/**
 * The MiPlante app (onboarding, till and checkout) is served by the backend under this same domain:
 * the frontend proxies it (proxy.conf.mjs, nginx.conf.template), so the links stay relative.
 */
export const APP_LINKS = {
  register: '/register',
  till: '/login',
} as const;
