/**
 * Plataformas que o Lume importa: nome, textos da tela e o passo a passo de cada uma.
 * (Os domínios ficam na API e no app desktop; aqui só o que a pessoa lê.)
 */
export const IMPORT_PLATFORMS = {
  udemy: {
    id: 'udemy',
    name: 'Udemy',
    title: 'Importar da Udemy',
    path: '/importar',
    openLabel: 'Abrir a Udemy',
    byLink: false,
  },
  alura: {
    id: 'alura',
    name: 'Alura',
    title: 'Importar da Alura',
    path: '/importar/alura',
    openLabel: 'Abrir a Alura',
    byLink: true,
    linkExample: 'https://www.alura.com.br/curso-online-…',
    listName: 'Meus cursos',
    // o que foi conferido de verdade no site e o que não
    linkNote: 'Pelo link entram o título, a descrição, a carga horária, a capa e a lista de capítulos e aulas.',
  },
  bradesco: {
    id: 'bradesco',
    name: 'Fundação Bradesco',
    title: 'Importar da Fundação Bradesco',
    path: '/importar/bradesco',
    openLabel: 'Abrir a Fundação Bradesco',
    byLink: true,
    linkExample: 'https://www.ev.org.br/cursos/…',
    listName: 'seus cursos',
    linkNote: 'Pelo link entram o título, a descrição, a carga horária e a lista de módulos. A página não tem capa nem duração por aula.',
  },
};

export const PLATFORM_ORDER = ['udemy', 'alura', 'bradesco'];

export const platformById = (id) => IMPORT_PLATFORMS[id] ?? null;

/** Aviso fixo das leituras logadas das plataformas novas. */
export const UNVERIFIED_NOTE = 'A leitura da lista de cursos logada ainda não foi verificada com conta real. Se não funcionar, use “Copiar diagnóstico” e envie o resultado para o ajuste.';
