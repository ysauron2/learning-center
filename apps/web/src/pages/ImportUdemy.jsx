import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { buildBookmarklet, parseImportMessage, parseExtensionMessage } from '../lib/bookmarklet.js';
import { ErrorState, ProgressBar } from '../components/ui.jsx';

export default function ImportUdemy() {
  const [items, setItems] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const linkRef = useRef(null);

  // O endereço javascript: é aplicado por fora do React (que avisa/bloqueia esse tipo de href).
  useEffect(() => {
    linkRef.current?.setAttribute('href', buildBookmarklet(window.location.origin));
  }, []);

  // Recebe a lista enviada pelo favorito (só aceita mensagens vindas da Udemy).
  useEffect(() => {
    const onMessage = async (e) => {
      const received = parseImportMessage(e) ?? parseExtensionMessage(e, window.location.origin, window);
      if (!received) return;
      setItems(received);
      setResult(null);
      setError(null);
      try {
        setPreview(await api.importPreview(received));
      } catch (err) {
        setError(err);
      }
    };
    window.addEventListener('message', onMessage);
    window.opener?.postMessage({ type: 'lc-ready' }, '*');
    window.postMessage({ type: 'lc-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.importCourses(items));
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
          <h1 className="page-title">Importar da Udemy</h1>
          <p className="page-sub">Traga seus cursos de uma vez, sem digitar. Você confere antes de salvar.</p>
        </div>
        <Link className="btn" to="/cursos">Voltar</Link>
      </header>

      {error && <ErrorState error={error} />}

      {result && (
        <section className="card" role="status" aria-live="polite">
          <h2 className="card-title">Pronto!</h2>
          <p>{result.created} curso(s) importado(s){result.skipped ? `, ${result.skipped} já existia(m)` : ''}.</p>
          <Link className="btn btn-primary" to="/cursos" style={{ marginTop: 12 }}>Ver meus cursos</Link>
        </section>
      )}

      {preview && (
        <section className="card" aria-label="Prévia da importação">
          <h2 className="card-title">Confira antes de salvar</h2>
          <p className="page-sub">
            {preview.new.length} novo(s) · {preview.existing.length} já cadastrado(s) (serão ignorados)
            {preview.invalid.length ? ` · ${preview.invalid.length} ignorado(s) por link inválido` : ''}
          </p>
          {preview.new.length > 0 && (
            <ul className="list" style={{ margin: '12px 0', padding: 0, listStyle: 'none' }}>
              {preview.new.map((c) => (
                <li key={c.url} style={{ padding: '8px 0', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                  <strong>{c.title}</strong>
                  <ProgressBar value={c.progress} label={`Progresso de ${c.title}`} />
                </li>
              ))}
            </ul>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={busy || preview.new.length === 0} onClick={confirm}>
              {busy ? 'Importando…' : `Importar ${preview.new.length} curso(s)`}
            </button>
            <button className="btn" disabled={busy} onClick={() => { setPreview(null); setItems(null); }}>Cancelar</button>
          </div>
        </section>
      )}

      {!preview && !result && (
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
    </>
  );
}
