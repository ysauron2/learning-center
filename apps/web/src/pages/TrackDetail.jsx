import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync, useToast } from '../lib/hooks.js';
import { Icon } from '../components/Icon.jsx';
import { TrackForm } from '../components/TrackForm.jsx';
import { TrackHint } from '../components/TrackHint.jsx';
import { ErrorState, ProgressBar, Skeleton, Toast } from '../components/ui.jsx';

const STATUS_TEXT = { done: 'Concluída', active: 'Em andamento', todo: 'A fazer' };

export default function TrackDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const loaded = useAsync(() => api.track(Number(id)), [id]);
  const courses = useAsync(() => api.courses(), []);
  const [track, setTrack] = useState(null);
  const [editing, setEditing] = useState(false);
  const [pickCourse, setPickCourse] = useState('');
  const [stepTitle, setStepTitle] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => { if (loaded.data) setTrack(loaded.data); }, [loaded.data]);

  /** Executa uma ação que devolve a trilha atualizada. */
  async function act(fn, okMessage) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result) setTrack(result);
      if (okMessage) showToast(okMessage);
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loaded.loading && !track) return <Skeleton height={320} />;
  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.refetch} />;
  if (!track) return null;

  const items = track.items;
  const inTrack = new Set(items.map((i) => i.courseId).filter(Boolean));
  const available = (courses.data ?? []).filter((c) => !inTrack.has(c.id));

  const move = (index, delta) => {
    const ids = items.map((i) => i.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    act(() => api.reorderTrack(track.id, ids));
  };

  async function addCourse(e) {
    e.preventDefault();
    if (!pickCourse) return;
    if (await act(() => api.addTrackItem(track.id, { courseId: Number(pickCourse) }), 'Curso adicionado.')) setPickCourse('');
  }

  async function addStep(e) {
    e.preventDefault();
    if (!stepTitle.trim()) return;
    if (await act(() => api.addTrackItem(track.id, { title: stepTitle }), 'Etapa adicionada.')) setStepTitle('');
  }

  async function removeTrack() {
    if (!window.confirm(`Apagar a trilha "${track.title}"? Os cursos não são apagados.`)) return;
    try {
      await api.deleteTrack(track.id);
      navigate('/trilhas');
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <nav aria-label="Você está em" className="muted" style={{ fontSize: 13 }}>
        <Link to="/trilhas">Trilhas</Link> › {track.title}
      </nav>

      <header className="page-head">
        <div>
          <h1 className="page-title">{track.title}</h1>
          {track.description && <p className="page-sub">{track.description}</p>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={16} />Editar</button>
          <button className="btn" onClick={removeTrack}><Icon name="trash" size={16} />Apagar trilha</button>
        </div>
      </header>

      <section className="card" aria-label="Progresso da trilha">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>{track.doneItems} de {track.totalItems} {track.totalItems === 1 ? 'etapa concluída' : 'etapas concluídas'}</span>
          <b>{track.progress}%</b>
        </div>
        <ProgressBar value={track.progress} tone={track.progress >= 100 ? 'green' : ''} size="lg" label="Progresso da trilha" />
        <p className="muted" style={{ margin: '8px 0 0' }}>
          {track.totalItems === 0 ? 'Adicione cursos ou etapas abaixo.' : track.next ? `Próxima etapa: ${track.next.title}` : 'Trilha concluída! 🎉'}
        </p>
        {track.next?.courseId && (
          <Link className="btn btn-primary" to={`/cursos/${track.next.courseId}`} style={{ marginTop: 12 }}>Continuar: {track.next.title}</Link>
        )}
      </section>

      <TrackHint />

      {error && <p className="alert error" role="alert">{error.details?.[0]?.message ?? error.message}</p>}

      <section className="card" aria-label="Etapas">
        <h2 className="card-title">Etapas, na ordem</h2>
        {items.length === 0 ? (
          <p className="muted">Nenhuma etapa ainda.</p>
        ) : (
          <ol className="track-steps">
            {items.map((it, index) => (
              <li key={it.id} className={`track-step${it.isNext ? ' next' : ''}${it.status === 'done' ? ' done' : ''}`} aria-current={it.isNext ? 'step' : undefined}>
                <span className="step-num" aria-hidden="true">{it.position}</span>
                <div className="step-main">
                  <div className="row" style={{ gap: 8 }}>
                    {it.kind === 'course' && it.course ? <Link to={`/cursos/${it.courseId}`}><strong>{it.title}</strong></Link> : <strong>{it.title}</strong>}
                    <span className={`badge ${it.status === 'done' ? 'success' : it.status === 'active' ? 'brand' : ''}`}>{STATUS_TEXT[it.status]}</span>
                    {it.isNext && <span className="badge warning">Próxima</span>}
                    {it.kind === 'step' && <span className="badge">Etapa avulsa</span>}
                  </div>
                  {it.kind === 'course' && it.course && (
                    <div className="muted" style={{ fontSize: 13 }}>{it.course.platform} · {it.course.category}</div>
                  )}
                  {it.kind === 'course' && <ProgressBar value={it.progress} tone={it.status === 'done' ? 'green' : ''} label={`Progresso de ${it.title}`} />}
                  {it.kind === 'course' && it.course && (
                    <div><Link className={`btn btn-sm${it.isNext ? ' btn-primary' : ''}`} to={`/cursos/${it.courseId}`}>Abrir o curso</Link></div>
                  )}
                  {it.kind === 'step' && (
                    <label className="row" style={{ gap: 8 }}>
                      <input type="checkbox" checked={it.status === 'done'} disabled={busy}
                        onChange={(e) => act(() => api.updateTrackItem(track.id, it.id, { done: e.target.checked }))} />
                      <span>Marcar como concluída</span>
                    </label>
                  )}
                </div>
                <div className="step-actions">
                  <button className="btn btn-sm" aria-label={`Mover "${it.title}" para cima`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
                  <button className="btn btn-sm" aria-label={`Mover "${it.title}" para baixo`} disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}>↓</button>
                  <button className="btn btn-sm" aria-label={`Tirar "${it.title}" da trilha`} disabled={busy}
                    onClick={() => { if (window.confirm(`Tirar "${it.title}" da trilha?`)) act(() => api.removeTrackItem(track.id, it.id).then(() => api.track(track.id)), 'Etapa removida.'); }}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="an-grid">
        <form className="card" onSubmit={addCourse} aria-label="Adicionar curso">
          <h2 className="card-title">Adicionar um curso</h2>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="td-course">Curso</label>
            <select id="td-course" className="select" value={pickCourse} onChange={(e) => setPickCourse(e.target.value)} disabled={available.length === 0}>
              <option value="">{available.length === 0 ? 'Todos os seus cursos já estão na trilha' : 'Escolha um curso…'}</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" type="submit" disabled={!pickCourse || busy} style={{ marginTop: 12 }}>Adicionar curso</button>
        </form>

        <form className="card" onSubmit={addStep} aria-label="Adicionar etapa avulsa">
          <h2 className="card-title">Adicionar uma etapa avulsa</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Para o que não é curso: uma prova, um projeto, um livro… Você marca como concluída à mão.</p>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="td-step">Nome da etapa</label>
            <input id="td-step" className="input" value={stepTitle} maxLength={200} placeholder="Ex.: Prova Security+" onChange={(e) => setStepTitle(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={!stepTitle.trim() || busy} style={{ marginTop: 12 }}>Adicionar etapa avulsa</button>
        </form>
      </div>

      {editing && (
        <TrackForm track={track} onClose={() => setEditing(false)} onSaved={(saved) => { setTrack(saved); setEditing(false); showToast('Trilha atualizada.'); }} />
      )}
      <Toast message={toast} />
    </>
  );
}
