import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync, useToast } from '../lib/hooks.js';
import { formatMinutes, relativeDay } from '../lib/format.js';
import { CourseArt } from '../components/CourseArt.jsx';
import { Icon } from '../components/Icon.jsx';
import { CourseForm } from '../components/CourseForm.jsx';
import { CourseNotes } from '../components/CourseNotes.jsx';
import { ErrorState, Modal, ProgressBar, Skeleton, StatusBadge, Toast } from '../components/ui.jsx';

function InlineAdd({ placeholder, buttonLabel, onAdd, withDuration }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <div className="inline-form">
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}><Icon name="plus" size={14} strokeWidth={2.4} />{buttonLabel}</button>
      </div>
    );
  }
  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onAdd({ title: title.trim(), durationMin: Number(duration) || 0 });
      setTitle('');
      setDuration('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="inline-title">{placeholder}</label>
      <input id="inline-title" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} />
      {withDuration && (
        <>
          <label className="sr-only" htmlFor="inline-dur">Duração em minutos</label>
          <input id="inline-dur" className="input" style={{ flex: '0 0 110px' }} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} placeholder="min" />
        </>
      )}
      <button className="btn btn-sm btn-primary" disabled={busy || !title.trim()}>Adicionar</button>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Fechar</button>
    </form>
  );
}

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: course, error, loading, reload, refetch } = useAsync(() => api.course(id), [id]);
  const sessions = useAsync(() => api.sessions({ courseId: id, limit: 100 }), [id]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, showToast] = useToast();
  const flash = useLocation().state?.flash; // mensagem enviada por quem levou até aqui (ex.: importação)
  useEffect(() => { if (flash) showToast(flash); }, [flash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return error.status === 404 ? (
      <div className="card" role="alert">
        <h1 className="page-title" style={{ fontSize: 24 }}>Curso não encontrado</h1>
        <p className="page-sub">Ele pode ter sido removido.</p>
        <Link className="btn" to="/cursos" style={{ marginTop: 14 }}>Voltar para cursos</Link>
      </div>
    ) : <ErrorState error={error} onRetry={refetch} />;
  }
  if (loading || !course) return <><Skeleton height={240} /><Skeleton height={320} /></>;

  const nextLesson = course.modules.flatMap((m) => m.lessons).find((l) => !l.completed);
  const sessionList = sessions.data ?? [];
  const totalMin = sessionList.reduce((sum, s) => sum + s.durationSec, 0) / 60;
  const done = course.status === 'completed';

  const act = async (fn, msg) => {
    try {
      await fn();
      if (msg) showToast(msg);
      reload();
      sessions.reload();
    } catch (e) {
      showToast(e.message);
    }
  };

  return (
    <>
      <nav aria-label="Trilha de navegação" className="muted" style={{ fontSize: 13, display: 'flex', gap: 8 }}>
        <Link to="/cursos" style={{ color: 'var(--brand-text)', fontWeight: 600 }}>Cursos</Link><span aria-hidden="true">›</span><span aria-current="page">{course.title}</span>
      </nav>

      <section className="card detail-head">
        <CourseArt className="detail-art" id={course.id} imageUrl={course.imageUrl} role="img" aria-label="Capa do curso" />
        <div className="detail-info">
          <div className="row" style={{ gap: 8 }}>
            <span className="badge brand">{course.platform}</span>
            <span className="badge">{course.category}</span>
            {course.tags.map((t) => <span key={t} className="tag">{t}</span>)}
            <StatusBadge status={course.status} />
          </div>
          <h1>{course.title}</h1>
          {course.description && <p style={{ margin: 0, color: 'var(--text-2)', maxWidth: 560 }}>{course.description}</p>}
          {course.url && <a href={course.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-text)', fontWeight: 600, fontSize: 14 }}>Abrir no site do curso ↗</a>}
          <div style={{ maxWidth: 520 }}>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'var(--text-2)' }}>
              <span>{course.totalLessons > 0 ? `${course.doneLessons} de ${course.totalLessons} aulas concluídas` : 'Progresso manual'}</span>
              <b style={{ color: 'var(--text)' }}>{course.progress}%</b>
            </div>
            <ProgressBar value={course.progress} size="lg" tone={done ? 'green' : ''} label="Progresso do curso" />
          </div>
          <div className="row" style={{ marginTop: 'auto' }}>
            {!done && (
              <Link className="btn btn-primary" to={`/foco?course=${course.id}${nextLesson ? `&lesson=${nextLesson.id}` : ''}&auto=1`}>
                <Icon name="play" size={15} />{nextLesson ? `Continuar: ${nextLesson.title}` : 'Iniciar sessão de foco'}
              </Link>
            )}
            {course.status === 'active' && <button className="btn" onClick={() => act(() => api.setCourseStatus(course.id, 'paused'), 'Curso pausado')}><Icon name="pause" size={15} strokeWidth={2.2} />Pausar</button>}
            {(course.status === 'paused' || course.status === 'planned') && <button className="btn" onClick={() => act(() => api.setCourseStatus(course.id, 'active'), 'Curso retomado')}>{course.status === 'planned' ? 'Iniciar curso' : 'Retomar curso'}</button>}
            {!done && <button className="btn" onClick={() => act(() => api.setCourseStatus(course.id, 'completed'), 'Curso concluído. Parabéns!')}><Icon name="check" size={15} strokeWidth={2.2} />Marcar como concluído</button>}
            {done && <button className="btn" onClick={() => act(() => api.setCourseStatus(course.id, 'active'), 'Curso reaberto')}>Reabrir</button>}
          </div>
        </div>
      </section>

      <div className="detail-grid">
        <section className="card" aria-label="Módulos e aulas">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="card-title" style={{ fontSize: 18 }}>Módulos e aulas</h2>
            <span className="muted" style={{ fontSize: 12 }}>{course.modules.length} módulos · {course.totalLessons} aulas</span>
          </div>
          {course.modules.length === 0 && (
            <p className="muted" style={{ margin: '12px 0 0' }}>
              Sem aulas cadastradas. Você pode acompanhar só pela porcentagem ou adicionar módulos e aulas abaixo.
            </p>
          )}
          {course.modules.map((m) => {
            const doneCount = m.lessons.filter((l) => l.completed).length;
            return (
              <div key={m.id}>
                <div className="module-title">
                  <span style={{ flex: 1 }}>{m.title}</span>
                  <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}>{doneCount}/{m.lessons.length}</span>
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ width: 36, minHeight: 36 }} aria-label={`Excluir módulo ${m.title}`}
                    onClick={() => act(() => api.deleteModule(m.id))}><Icon name="trash" size={15} /></button>
                </div>
                {m.lessons.map((l) => (
                  <div key={l.id} className={`lesson${l.completed ? ' done' : ''}${nextLesson?.id === l.id ? ' next' : ''}`}>
                    <button className="check" role="checkbox" aria-checked={l.completed} aria-label={`${l.title}: ${l.completed ? 'concluída' : 'pendente'}`}
                      onClick={() => act(() => api.updateLesson(l.id, { completed: !l.completed }))}>
                      {l.completed && <Icon name="check" size={14} strokeWidth={3.4} />}
                    </button>
                    <span className="lesson-title">{l.title}</span>
                    {nextLesson?.id === l.id && <span className="badge brand">Próxima</span>}
                    {l.durationMin > 0 && <span className="muted" style={{ fontSize: 12 }}>{l.durationMin} min</span>}
                    <button className="btn btn-ghost btn-sm btn-icon" style={{ width: 36, minHeight: 36 }} aria-label={`Excluir aula ${l.title}`}
                      onClick={() => act(() => api.deleteLesson(l.id))}><Icon name="trash" size={15} /></button>
                  </div>
                ))}
                <InlineAdd placeholder="Título da aula" buttonLabel="Adicionar aula" withDuration
                  onAdd={(d) => act(() => api.addLesson(m.id, d))} />
              </div>
            );
          })}
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <InlineAdd placeholder="Título do módulo" buttonLabel="Adicionar módulo" onAdd={({ title }) => act(() => api.addModule(course.id, title))} />
          </div>
        </section>

        <aside style={{ display: 'grid', gap: 20 }}>
          <section className="card" aria-label="Seu ritmo">
            <h2 className="card-title" style={{ marginBottom: 14 }}>Seu ritmo neste curso</h2>
            <dl style={{ margin: 0, display: 'grid', gap: 12, fontSize: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><dt style={{ color: 'var(--text-2)' }}>Tempo estudado</dt><dd style={{ margin: 0, fontWeight: 700 }}>{formatMinutes(totalMin)}</dd></div>
              <div className="row" style={{ justifyContent: 'space-between' }}><dt style={{ color: 'var(--text-2)' }}>Sessões</dt><dd style={{ margin: 0, fontWeight: 700 }}>{sessionList.length}</dd></div>
              <div className="row" style={{ justifyContent: 'space-between' }}><dt style={{ color: 'var(--text-2)' }}>Última atividade</dt><dd style={{ margin: 0, fontWeight: 700 }}>{course.lastStudiedAt ? relativeDay(course.lastStudiedAt) : '—'}</dd></div>
            </dl>
          </section>
          <CourseNotes courseId={course.id} />
          <section className="card" aria-label="Gerenciar curso">
            <h2 className="card-title" style={{ marginBottom: 12 }}>Gerenciar</h2>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setEditing(true)}><Icon name="edit" size={14} />Editar</button>
              <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={14} />Excluir</button>
            </div>
          </section>
        </aside>
      </div>

      {editing && <CourseForm course={course} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); showToast('Curso atualizado'); reload(); }} />}
      {confirmDelete && (
        <Modal title="Excluir este curso?" onClose={() => setConfirmDelete(false)}>
          <p style={{ margin: 0, color: 'var(--text-2)' }}>
            Módulos, aulas e o vínculo com as sessões serão removidos. O tempo já registrado continua no histórico. Essa ação não pode ser desfeita.
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setConfirmDelete(false)}>Cancelar</button>
            <button className="btn btn-danger" onClick={async () => { await api.deleteCourse(course.id); navigate('/cursos'); }}>Excluir curso</button>
          </div>
        </Modal>
      )}
      <Toast message={toast} />
    </>
  );
}
