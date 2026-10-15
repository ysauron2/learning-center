import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { buildBookmarklet, parseImportMessage, parseExtensionMessage, extensionPlatform } from '../lib/bookmarklet.js';
import { hasWork, confirmLabel } from '../lib/import-preview.js';
import { DesktopUdemy, isDesktop } from '../components/DesktopUdemy.jsx';
import { DesktopPlatform } from '../components/DesktopPlatform.jsx';
import { ImportTabs } from '../components/ImportTabs.jsx';
import { ImportByLink } from '../components/ImportByLink.jsx';
import { IMPORT_PLATFORMS, UNVERIFIED_NOTE } from '../lib/platforms.js';
import { ChoiceOrNew } from '../components/ChoiceOrNew.jsx';
import { DEFAULT_CATEGORIES } from '../lib/choices.js';
import { useAsync } from '../lib/hooks.js';
import { ErrorState, ProgressBar } from '../components/ui.jsx';

/** Importar os cursos de uma plataforma (lista "Meus cursos" lida pelo app desktop ou pela extensão). */
export default function ImportPlatform({ platform = 'udemy' }) {
  const info = IMPORT_PLATFORMS[platform];
  const isUdemy = platform === 'udemy';
  const [items, setItems] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const linkRef = useRef(null);
  const [category, setCategory] = useState('Geral');
  const opts = useAsync(() => api.options(), []);

  // O endereço javascript: é aplicado por fora do React (que avisa/bloqueia esse tipo de href).
  useEffect(() => {
    linkRef.current?.setAttribute('href', buildBookmarklet(window.location.origin));
  }, []);

  // Recebe a lista enviada pelo favorito (só aceita mensagens vindas da Udemy).
  useEffect(() => {
    const onMessage = async (e) => {
      // o favorito (bookmarklet) só existe para a Udemy; a extensão e o desktop dizem de qual plataforma é a lista
      const fromExtension = parseExtensionMessage(e, window.location.origin, window);
      if (fromExtension && extensionPlatform(e) !== platform) return;
      const received = (isUdemy ? parseImportMessage(e) : null) ?? fromExtension;
      if (!received) return;
      setItems(received);
      setResult(null);
      setError(null);
      try {
        setPreview(await (isUdemy ? api.importPreview(received) : api.importPreview(received, platform)));
      } catch (err) {
        setError(err);
      }
    };
    window.addEventListener('message', onMessage);
    window.opener?.postMessage({ type: 'lc-ready' }, '*');
    window.postMessage({ type: 'lc-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, [platform, isUdemy]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const cat = category.trim() || undefined;
      setResult(await (isUdemy ? api.importCourses(items, cat) : api.importCourses(items, cat, platform)));
      setPreview(null);
      setItems(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">{info.title}</h1>
          <p className="page-sub">Traga seus cursos de uma vez, sem digitar. Você confere antes de salvar.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {isUdemy && <Link className="btn" to="/importar-conteudo">Importar conteúdo de um curso</Link>}
          <Link className="btn" to="/cursos">Voltar</Link>
        </div>
      </header>

      <ImportTabs />

      {error && <ErrorState error={error} />}

      {result && (
        <section className="card" role="status" aria-live="polite">
          <h2 className="card-title">Pronto!</h2>
          <p>{result.created} curso(s) importado(s){result.skipped ? `, ${result.skipped} já existia(m)` : ''}{result.imagesFilled ? `, ${result.imagesFilled} capa(s) preenchida(s)` : ''}{result.progressUpdated ? `, ${result.progressUpdated} progresso(s) atualizado(s)` : ''}.</p>
          <Link className="btn btn-primary" to="/cursos" style={{ marginTop: 12 }}>Ver meus cursos</Link>
        </section>
      )}

      {preview && (
        <section className="card" aria-label="Prévia da importação">
          <h2 className="card-title">Confira antes de salvar</h2>
          <p className="page-sub">
            {preview.new.length} novo(s) · {preview.existing.length} já cadastrado(s) (serão ignorados)
            {preview.invalid.length ? ` · ${preview.invalid.length} ignorado(s) por link inválido` : ''}
            {preview.imagesToFill ? ` · ${preview.imagesToFill} capa(s) serão preenchidas em cursos já cadastrados` : ''}
            {preview.progressToUpdate ? ` · ${preview.progressToUpdate} progresso(s) serão atualizados` : ''}
          </p>
          {preview.new.length > 0 && (
            <div style={{ marginTop: 12, maxWidth: 360 }}>
              <ChoiceOrNew id="imp-category" label="Categoria dos cursos novos" value={category} options={opts.data ? opts.data.categories.map((c) => c.name) : DEFAULT_CATEGORIES}
                onChange={setCategory} newLabel="Nova categoria…" placeholder="Ex.: Design" />
            </div>
          )}
          {preview.new.length > 0 && (
            <ul className="list" style={{ margin: '12px 0', padding: 0, listStyle: 'none' }}>
              {preview.new.map((c) => (
                <li key={c.url} style={{ padding: '8px 0', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                  <strong>{c.title}</strong>{c.hasImage ? '' : <span className="muted" style={{ fontSize: 12 }}> · sem capa</span>}
                  <ProgressBar value={c.progress} label={`Progresso de ${c.title}`} />
                </li>
              ))}
            </ul>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={busy || !hasWork(preview)} onClick={confirm}>
              {busy ? 'Importando…' : confirmLabel(preview)}
            </button>
            <button className="btn" disabled={busy} onClick={() => { setPreview(null); setItems(null); }}>Cancelar</button>
          </div>
        </section>
      )}

      {!preview && !result && isDesktop() && (isUdemy ? <DesktopUdemy /> : <DesktopPlatform platform={platform} />)}

      {!preview && !result && !isDesktop() && isUdemy && (
        <section className="card" aria-label="Como importar">
          <h2 className="card-title">Como importar (extensão do navegador)</h2>
          <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Uma vez só: no Brave, abra <code>brave://extensions</code>, ligue o <strong>Modo do desenvolvedor</strong>, clique em <strong>Carregar sem compactação</strong> e escolha a pasta <code>apps/extension/dist</code> deste projeto.</li>
            <li>Entre na Udemy como sempre e abra <strong>Meus cursos</strong>. Role até o fim.</li>
            <li>Clique no botão roxo <strong>Importar para o Learning Center</strong>, no canto da página.</li>
            <li>Esta página abre sozinha com a prévia. Confira e salve.</li>
          </ol>
          <p className="page-sub">
            A extensão só lê o que já está na tela. Ela não usa sua senha nem acessa a sua conta da Udemy.
          </p>
          <details style={{ marginTop: 12 }}>
            <summary>Alternativa: favorito (menos confiável)</summary>
            <p>
              Arraste este botão para a barra de favoritos e clique nele em <strong>Meus cursos</strong>:{' '}
              <a ref={linkRef} className="btn" draggable href="#importar" onClick={(e) => e.preventDefault()}>
                Importar para o Learning Center
              </a>
            </p>
          </details>
        </section>
      )}
      {!preview && !result && !isDesktop() && !isUdemy && (
        <section className="card" aria-label="Como importar">
          <h2 className="card-title">Como importar a lista dos seus cursos (extensão do navegador)</h2>
          <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Uma vez só: no Brave, abra <code>brave://extensions</code>, ligue o <strong>Modo do desenvolvedor</strong>, clique em <strong>Carregar sem compactação</strong> e escolha a pasta <code>apps/extension/dist</code> deste projeto.</li>
            <li>Entre na {info.name} como sempre e abra a lista dos {info.listName}. Role até o fim.</li>
            <li>Clique no botão roxo <strong>Importar meus cursos da {info.name}</strong>, no canto da página.</li>
            <li>Esta página abre sozinha com a prévia. Confira e salve.</li>
          </ol>
          <p className="page-sub">A extensão só lê o que já está na tela. Ela não usa sua senha nem acessa a sua conta.</p>
          <p className="page-sub" role="note"><strong>Atenção:</strong> {UNVERIFIED_NOTE}</p>
        </section>
      )}

      {!preview && !result && info.byLink && <ImportByLink platform={platform} />}
    </>
  );
}
