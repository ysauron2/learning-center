import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { Icon } from './Icon.jsx';
import { Skeleton } from './ui.jsx';

export const QUICK_MINUTES = [15, 25, 45];

/** Endereço da tela de foco que já começa a sessão (pomodoro de `min` minutos) no curso/aula indicados. */
export function focusHref({ courseId, lessonId, min = 25 }) {
  const p = new URLSearchParams();
  if (courseId) p.set('course', courseId);
  if (courseId && lessonId) p.set('lesson', lessonId);
  p.set('auto', '1');
  p.set('min', min);
  return `/foco?${p}`;
}

const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

/**
 * Curso do foco rápido: bloco de estudo que está acontecendo agora; senão o curso da "próxima ação"; senão foco livre.
 * `upcoming` são os eventos de /calendar/upcoming.
 */
export function pickQuickCourse({ upcoming = [], nextAction, now = new Date() }) {
  const current = upcoming.find((e) => (e.kind === 'plan' || e.kind === 'once') && e.courseId && new Date(e.start) <= now && now < new Date(e.end));
  if (current) return { courseId: current.courseId, title: current.courseTitle, lessonId: null, lessonTitle: current.lessonTitle ?? null, source: 'block' };
  const course = nextAction?.course;
  if (course && nextAction.type !== 'add_course') {
    return { courseId: course.id, title: course.title, lessonId: nextAction.lesson?.id ?? null, lessonTitle: nextAction.lesson?.title ?? null, source: 'next' };
  }
  return { courseId: null, title: null, lessonId: null, lessonTitle: null, source: 'free' };
}

const FREE = { courseId: null, title: null, lessonId: null, lessonTitle: null, source: 'free' };

/** Cartão "Foco rápido" do Início: um clique começa uma sessão de 15, 25 ou 45 minutos. */
export function QuickFocus({ nextAction }) {
  const active = useAsync(() => safe(() => api.activeSession(), null), []);
  const upcoming = useAsync(() => safe(() => api.calendarUpcoming(1), []), []);
  const [changing, setChanging] = useState(false);
  const [choice, setChoice] = useState(null); // null = automático; '' = foco livre; 'id' = curso escolhido
  const courses = useAsync(() => (changing ? api.courses({ status: 'active' }) : Promise.resolve(null)), [changing]);

  if (active.loading || upcoming.loading) {
    return <section className="card quick-card" aria-label="Foco rápido" aria-busy="true"><Skeleton height={90} /></section>;
  }

  if (active.data) {
    const s = active.data;
    return (
      <section className="card quick-card" aria-label="Foco rápido">
        <h2 className="card-title">Foco rápido</h2>
        <p role="status" style={{ margin: '8px 0 0' }}>Você tem uma sessão em andamento{s.courseTitle ? ` · ${s.courseTitle}` : ''}.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <Link to="/foco" className="btn btn-primary"><Icon name="play" size={16} />Voltar para a sessão</Link>
        </div>
      </section>
    );
  }

  const auto = pickQuickCourse({ upcoming: upcoming.data ?? [], nextAction });
  const list = courses.data ?? [];
  let pick = auto;
  if (choice !== null) {
    if (choice === '') {
      pick = FREE;
    } else {
      const same = Number(choice) === auto.courseId;
      const found = list.find((c) => String(c.id) === choice);
      pick = { courseId: Number(choice), title: found?.title ?? auto.title, lessonId: same ? auto.lessonId : null, lessonTitle: same ? auto.lessonTitle : null, source: 'chosen' };
    }
  }
  const where = pick.courseId
    ? `${pick.title}${pick.lessonTitle ? ` · Aula: ${pick.lessonTitle}` : ''}`
    : 'Foco livre (sem curso)';
  const origin = { block: 'bloco de estudo de agora', next: 'sua próxima ação', free: '', chosen: 'escolhido por você' }[pick.source];

  return (
    <section className="card quick-card" aria-label="Foco rápido">
      <h2 className="card-title">Foco rápido</h2>
      <p style={{ margin: '4px 0 0', fontWeight: 600 }} id="quick-focus-q">Quanto tempo você tem agora?</p>
      <div className="row" role="group" aria-labelledby="quick-focus-q" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {QUICK_MINUTES.map((m) => (
          <Link key={m} className="btn btn-primary" to={focusHref({ courseId: pick.courseId, lessonId: pick.lessonId, min: m })}>{m} min</Link>
        ))}
      </div>
      <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }} aria-live="polite">
        <span>Vai estudar: <b style={{ color: 'var(--text)' }}>{where}</b></span>
        {origin && <span> ({origin})</span>}
      </p>
      {!changing ? (
        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, minHeight: 32 }} onClick={() => setChanging(true)}>Trocar curso</button>
      ) : (
        <div className="field" style={{ marginTop: 8, maxWidth: 360 }}>
          <label htmlFor="quick-focus-course">Curso do foco rápido</label>
          <select id="quick-focus-course" className="select" value={choice ?? (auto.courseId ? String(auto.courseId) : '')} onChange={(e) => setChoice(e.target.value)} disabled={courses.loading}>
            <option value="">Foco livre (sem curso)</option>
            {auto.courseId && !list.some((c) => c.id === auto.courseId) && <option value={auto.courseId}>{auto.title}</option>}
            {list.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {courses.error && <span role="alert" className="alert error">Não foi possível carregar seus cursos.</span>}
        </div>
      )}
    </section>
  );
}
