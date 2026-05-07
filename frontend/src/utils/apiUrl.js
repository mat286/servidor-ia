function browserDefaultApiUrl() {
  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || 'localhost';
  return `${protocol}//${hostname}:3000`;
}

export function resolveApiUrl(rawValue) {
  const raw = String(rawValue || '').trim();

  if (!raw) {
    return browserDefaultApiUrl();
  }

  // Soportar rutas relativas (/api) sin tocarlas.
  if (raw.startsWith('/')) {
    return raw;
  }

  try {
    const parsed = new URL(raw);

    // Hostnames internos de Docker no resolubles desde el navegador.
    if (parsed.hostname === 'backend' || parsed.hostname === 'ollama') {
      return browserDefaultApiUrl();
    }

    return parsed.origin;
  } catch {
    return browserDefaultApiUrl();
  }
}

export const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL);
