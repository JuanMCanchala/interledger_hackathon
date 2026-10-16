/** The MiPlante app (onboarding, till and checkout) is served from its own subdomain. */
const APP_URL = 'https://app.miplante.online';

export const APP_LINKS = {
  register: `${APP_URL}/onboard.html`,
  till: `${APP_URL}/merchant.html`,
} as const;
