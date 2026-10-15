/**
 * Reconhece, pelo endereço colado, de qual plataforma é o curso. A lista (nomes e endereços) vem da API,
 * que a tira do registro de plataformas: aqui não existe nenhuma lista própria.
 */
export function detectPlatform(raw, platforms) {
  const text = String(raw ?? '').trim();
  if (!text || !Array.isArray(platforms)) return null;
  let host;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  return platforms.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

/** "A, B e C" */
export function joinNames(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : (names[0] ?? '');
}
