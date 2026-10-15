import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { countLessons, matchCourse, parseContentMessage } from '../lib/content-import.js';
import { ErrorState, ProgressBar } from '../components/ui.jsx';
import { DesktopUdemy, isDesktop } from '../components/DesktopUdemy.jsx';

export default function ImportContent() {
  const [content, setContent] = useState(null);
  const [courseId, setCourseId] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const courses = useAsync(() => api.courses(), []);

  // Recebe o conteúdo lido pela extensão (só aceita mensagem da própria página).
  useEffect(() => {
    const onMessage = (e) => {
      const received = parseContentMessage(e, window.location.origin, window);
      if (!received) return;
      setContent(received);
      setResult(null);
      setPreview(null);
      setError(null);
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'lc-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Sugere o curso de destino quando o conteúdo e a lista de cursos estiverem prontos.
  useEffect(() => {
    if (content && courses.data) {
      const id = matchCourse(courses.data, content);
      setCourseId(id ? String(id) : '');
    }
  }, [content, courses.data]);

  // Prévia sempre que o destino muda (nada é gravado).
  useEffect(() => {
    if (!content || !courseId) {
      setPreview(null);
      return undefined;
    }
    let alive = true;
    api.importContentPreview(Number(courseId), content.modules, content.url)
      .then((p) => { if (alive) { setPreview(p); setError(null); } })
      .catch((err) => { if (alive) setError(err); });
    return () => { alive = false; };
  }, [content, courseId]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const done = await api.importContent(Number(courseId), content.modules, content.url);
      setResult({ ...done, courseId: Number(courseId) });
      setContent(null);
      setPreview(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const nothingNew = preview && preview.modulesCreated === 0 && preview.lessonsCreated === 0 && preview.lessonsCompleted === 0;

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Importar conteúdo do curso</h1>
          <p className="page-sub">Traga módulos e aulas, com o que você já assistiu. Você confere antes de salvar.</p>
        </div>
        <Link className="btn" to="/cursos">Voltar</Link>
      </header>

      {error && <ErrorState error={error} />}

      {result && (
        <section className="card" role="status" aria-live="polite">
          <h2 className="card-title">Pronto!</h2>
          <p>
            {result.modulesCreated} módulo(s) e {result.lessonsCreated} aula(s) criados
            {result.lessonsCompleted ? `, ${result.lessonsCompleted} marcada(s) como concluída(s)` : ''}.
          </p>
          <Link className="btn btn-primary" to={`/cursos/${result.courseId}`} style={{ marginTop: 12 }}>Ver o curso</Link>
        </section>
      )}

      {content && (
        <section className="card" aria-label="Prévia da importação">
          <h2 className="card-title">Confira antes de salvar</h2>
          <p className="page-sub">
            Lido na Udemy: <strong>{content.title || 'curso sem título'}</strong> · {content.modules.length} módulo(s) · {countLessons(content.modules)} aula(s)
          </p>
          <label htmlFor="dest" style={{ display: 'block', marginTop: 14, fontWeight: 600 }}>Importar para qual curso?</label>
          <select id="dest" className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)} style={{ maxWidth: 520 }}>
            <option value="">Escolha o curso…</option>
            {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {!courseId && <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Não consegui adivinhar o curso. Escolha na lista.</p>}

          {preview && (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 8px' }}>
                {nothingNew
                  ? 'Nada de novo: tudo isso já está no curso.'
                  : `Vai criar ${preview.modulesCreated} módulo(s) e ${preview.lessonsCreated} aula(s), e marcar ${preview.lessonsCompleted} como concluída(s).`}
              </p>
              <ProgressBar value={preview.after.progress} label="Progresso do curso depois da importação" />
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                Depois: {preview.after.done} de {preview.after.total} aulas concluídas ({preview.after.progress}%).
              </p>
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" disabled={busy || !preview || nothingNew} onClick={confirm}>
              {busy ? 'Importando…' : 'Importar conteúdo'}
            </button>
            <button className="btn" disabled={busy} onClick={() => { setContent(null); setPreview(null); }}>Cancelar</button>
          </div>
        </section>
      )}

      {!content && !result && isDesktop() && <DesktopUdemy />}

      {!content && !result && !isDesktop() && (
        <section className="card" aria-label="Como importar o conteúdo">
          <h2 className="card-title">Como importar (um clique por curso)</h2>
          <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Na Udemy, abra o curso e entre no <strong>player</strong>, onde você assiste às aulas.</li>
            <li>Deixe visível a barra <strong>Conteúdo do curso</strong>.</li>
            <li>Clique no botão roxo <strong>Importar conteúdo deste curso</strong>, no canto da página.</li>
            <li>Esta página abre sozinha com a prévia. Escolha o curso de destino, se precisar, e confirme.</li>
          </ol>
          <p className="page-sub">Precisa da extensão instalada (veja “Importar da Udemy”). Importar de novo não duplica: só acrescenta o que faltar.</p>
          <Link className="btn" to="/importar" style={{ marginTop: 8 }}>Importar da Udemy</Link>
        </section>
      )}
    </>
  );
}
