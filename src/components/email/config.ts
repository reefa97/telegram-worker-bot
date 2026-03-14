const rawUrl = import.meta.env.VITE_EMAIL_SERVICE_URL || 'http://localhost:8080';
export const EMAIL_SERVICE_URL = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
