import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { noteLabel } from '../lib/notes.js';
import { relativeDay } from '../lib/format.js';

const SHOWN = 5;

/** Anotações ligadas a este curso, com atalho para escrever uma nova já vinculada. */
export function CourseNotes({ courseId }) {
  const notes = useAsync(() => api.notes({ courseId }), [courseId]);
  const list = notes.data ?? [];

  return (
    <section className="card" aria-label="Anotações do curso">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="card-title">Anotações</h2>
        <Link className="btn btn-sm" to={`/anotacoes/nova?curso=${courseId}`}>Nova anotação</Link>
      </div>
      {notes.error && <p className="muted" style={{ margin: 0 }}>Não foi possível carregar as anotações.</p>}
      {notes.data && list.length === 0 && <p className="muted" style={{ margin: 0 }}>Nenhuma anotação neste curso ainda.</p>}
      {list.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {list.slice(0, SHOWN).map((n) => (
            <li key={n.id}>
              <Link to={`/anotacoes/${n.id}`}>{noteLabel(n)}</Link>
              <span className="muted" style={{ fontSize: 12 }}> · {relativeDay(n.updatedAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {list.length > SHOWN && (
        <p style={{ margin: '10px 0 0' }}><Link to={`/anotacoes?curso=${courseId}`}>Ver todas ({list.length})</Link></p>
      )}
    </section>
  );
}
