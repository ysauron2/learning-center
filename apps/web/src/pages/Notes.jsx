import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync, useDebounced } from '../lib/hooks.js';
import { noteLabel } from '../lib/notes.js';
import { relativeDay } from '../lib/format.js';
import { Icon } from '../components/Icon.jsx';
import { NoteEditor } from '../components/NoteEditor.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui.jsx';

export default function Notes() {
  const { id } = useParams(); // undefined (só a lista) | 'nova' | número
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [courseId, setCourseId] = useState(() => (id === undefined ? sp.get('curso') ?? '' : ''));
  const [tag, setTag] = useState('');
  const [version, setVersion] = useState(0);
  const dq = useDebounced(q);

  const list = useAsync(() => api.notes({ q: dq, courseId, tag }), [dq, courseId, tag, version]);
  const tags = useAsync(() => api.noteTags(), [version]);
  const courses = useAsync(() => api.courses(), []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const editing = id !== undefined;
  const filtering = Boolean(dq || courseId || tag);
  const preset = id === 'nova' ? { courseId: sp.get('curso'), lessonId: sp.get('aula') } : null;

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Anotações</h1>
          <p className="page-sub">Resumos e dúvidas em Markdown, ligados aos seus cursos e aulas.</p>
        </div>
        <Link className="btn btn-primary" to={`/anotacoes/nova${courseId ? `?curso=${courseId}` : ''}`}>
          <Icon name="plus" size={16} strokeWidth={2.4} />Nova anotação
        </Link>
      </header>

      <div className={`notes-layout${editing ? ' has-editor' : ''}`}>
        <section className="card notes-list" aria-label="Lista de anotações">
          <label className="search">
            <Icon name="search" />
            <span className="sr-only">Pesquisar anotações</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar no título, texto e tags" />
          </label>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <label className="sr-only" htmlFor="nf-course">Curso</label>
            <select id="nf-course" className="select" style={{ flex: 1 }} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Todos os cursos</option>
              {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          {(tags.data ?? []).length > 0 && (
            <div className="row" role="group" aria-label="Tags" style={{ gap: 6, marginTop: 10 }}>
              {tags.data.map((t) => (
                <button key={t.tag} className="chip" aria-pressed={tag === t.tag} onClick={() => setTag(tag === t.tag ? '' : t.tag)}>
                  {t.tag} · {t.count}
                </button>
              ))}
            </div>
          )}

          {list.loading && !list.data && <Skeleton height={160} style={{ marginTop: 12 }} />}
          {list.error && <ErrorState error={list.error} onRetry={list.refetch} />}
          {list.data && list.data.length === 0 && (
            <div style={{ marginTop: 12 }}>
              {filtering ? (
                <p className="muted">Nenhuma anotação encontrada com esses filtros.</p>
              ) : (
                <EmptyState icon="note" title="Nenhuma anotação ainda" action={<Link className="btn btn-primary" to="/anotacoes/nova">Escrever a primeira</Link>}>
                  Anote o que aprendeu em cada aula. Fica tudo aqui, com busca.
                </EmptyState>
              )}
            </div>
          )}
          {list.data && list.data.length > 0 && (
            <ul className="note-items">
              {list.data.map((n) => (
                <li key={n.id}>
                  <Link to={`/anotacoes/${n.id}`} className="note-item" aria-current={String(n.id) === id ? 'true' : undefined}>
                    <strong>{noteLabel(n)}</strong>
                    {n.title && n.excerpt && <span className="muted note-excerpt">{n.excerpt}</span>}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {n.courseTitle ? `${n.courseTitle} · ` : ''}{relativeDay(n.updatedAt)}
                    </span>
                    {n.tags.length > 0 && <span className="row" style={{ gap: 4 }}>{n.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {editing ? (
          <NoteEditor
            key={`${id}-${sp.get('curso') ?? ''}-${sp.get('aula') ?? ''}`}
            noteId={id}
            preset={preset}
            courses={courses.data}
            onChanged={refresh}
            onCreated={(newId) => navigate(`/anotacoes/${newId}`, { replace: true })}
            onDeleted={() => navigate('/anotacoes')}
            onClose={() => navigate('/anotacoes')}
          />
        ) : (
          <section className="card notes-placeholder" aria-hidden="true">
            <p className="muted">Escolha uma anotação na lista ou crie uma nova.</p>
          </section>
        )}
      </div>
    </>
  );
}
