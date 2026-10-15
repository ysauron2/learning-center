/**
 * Plataformas que o app desktop abre em janela própria (com login próprio e sessão guardada).
 * Domínios: o próprio host ou subdomínio dele, sempre por https (nunca "contém").
 */
export const PLATFORMS = {
  udemy: {
    id: 'udemy',
    name: 'Udemy',
    domains: ['udemy.com'],
    home: 'https://www.udemy.com/home/my-courses/learning/',
    importPath: '/importar',
  },
  alura: {
    id: 'alura',
    name: 'Alura',
    domains: ['alura.com.br'],
    // "Meus cursos": exige login (sem login, o site manda para a tela de entrada)
    home: 'https://cursos.alura.com.br/dashboard',
    importPath: '/importar/alura',
  },
  bradesco: {
    id: 'bradesco',
    name: 'Fundação Bradesco',
    domains: ['ev.org.br'],
    // endereço da área do aluno não confirmado sem conta: abre a página inicial e a pessoa entra por lá
    home: 'https://www.ev.org.br/',
    importPath: '/importar/bradesco',
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS);

/** Id da plataforma dona deste endereço (https + domínio exato/subdomínio) ou null. */
export function platformOfUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    return PLATFORM_IDS.find((id) => PLATFORMS[id].domains.some((d) => host === d || host.endsWith(`.${d}`))) ?? null;
  } catch {
    return null;
  }
}
