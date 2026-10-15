import { HttpError } from './errors.js';
import { parseCourseLink, platformForHost, invalidLinkMessage } from './platforms.js';
import { MESSAGES, fetchText, parseAluraPage, parseBradescoPage } from './course-pages.js';
import { parseMicrosoftPage, loadFreeCodeCamp, parseCourseraPage, parseRocketseatPage } from './course-sources.js';

/**
 * Do link colado ao curso lido. Cada plataforma do registro (platforms.js) tem aqui UM leitor:
 *  - `parse(html, ref, ctx)`: lê a página do curso (ctx.get busca mais dados da mesma plataforma, com as mesmas regras de segurança);
 *  - `load(ref, ctx)`: para quem não tem a página útil (a freeCodeCamp só carrega por JavaScript).
 */
const READERS = {
  alura: { parse: (html, ref) => parseAluraPage(html, ref) },
  bradesco: { parse: (html, ref) => parseBradescoPage(html, ref) },
  microsoft: { parse: parseMicrosoftPage },
  freecodecamp: { load: loadFreeCodeCamp },
  coursera: { parse: (html, ref) => parseCourseraPage(html, ref) },
  rocketseat: { parse: (html, ref) => parseRocketseatPage(html, ref) },
};

function hostOf(raw) {
  const text = String(raw ?? '').trim();
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }
}

export async function loadCourseFromLink(rawUrl, fetchImpl) {
  const ref = parseCourseLink(rawUrl);
  if (!ref) {
    const host = hostOf(rawUrl);
    throw new HttpError(400, 'LINK_INVALID', invalidLinkMessage(host && platformForHost(host) ? host : null));
  }
  const reader = READERS[ref.platform.id];
  const ctx = { get: (url, opts) => fetchText(url, ref.platform, fetchImpl, opts) };
  if (reader.load) return reader.load(ref, ctx);
  const { text, finalUrl } = await ctx.get(ref.url);
  // se o site redirecionou (ex.: cursos.alura.com.br/course/x → www.alura.com.br/curso-online-x), vale o endereço final;
  // se terminou numa página que não é de curso (ex.: a página inicial), o curso não existe
  // (plataformas com `acceptFinal` mudam o endereço do curso de lugar; vale o que a pessoa colou, que é o estável)
  const finalRef = ref.platform.acceptFinal ? (ref.platform.acceptFinal(new URL(finalUrl)) ? ref : null) : parseCourseLink(finalUrl);
  if (!finalRef || finalRef.platform.id !== ref.platform.id) throw new HttpError(422, 'COURSE_NOT_FOUND', MESSAGES.notCourse);
  return reader.parse(text, finalRef, ctx);
}
