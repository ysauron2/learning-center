import { Link } from 'react-router-dom';
import { ProgressBar, StatusBadge } from './ui.jsx';
import { thumbFor, formatMinutes } from '../lib/format.js';

export function CourseCard({ course }) {
  const c = course;
  const cta = c.status === 'completed' ? 'Revisar' : c.status === 'paused' ? 'Retomar' : 'Continuar';
  const tone = c.status === 'completed' ? 'green' : '';
  return (
    <article className="card course-card">
      <div className="course-thumb" style={{ background: thumbFor(c.id) }}>
        <span className="plat">{c.platform}</span>
      </div>
      <div className="course-body">
        <div>
          <h3><Link to={`/cursos/${c.id}`}>{c.title}</Link></h3>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {c.category} · {c.totalLessons > 0 ? `${c.doneLessons}/${c.totalLessons} aulas` : 'progresso manual'}
            {c.studiedMinutes > 0 && ` · ${formatMinutes(c.studiedMinutes)} estudados`}
          </div>
        </div>
        {c.tags.length > 0 && <div className="row" style={{ gap: 6 }}>{c.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
        <div style={{ marginTop: 'auto' }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, marginBottom: 7 }}>
            <StatusBadge status={c.status} />
            <b>{c.progress}%</b>
          </div>
          <ProgressBar value={c.progress} tone={tone} label={`Progresso de ${c.title}`} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className={`btn ${c.status === 'completed' ? '' : 'btn-primary'}`} style={{ flex: 1 }}
            to={c.status === 'completed' ? `/cursos/${c.id}` : `/foco?course=${c.id}`}>{cta}</Link>
          <Link className="btn" to={`/cursos/${c.id}`} aria-label={`Detalhes de ${c.title}`}>Detalhes</Link>
        </div>
      </div>
    </article>
  );
}
