import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync, useToast } from '../lib/hooks.js';
import { formatMinutes, relativeDay, greeting } from '../lib/format.js';
import { Icon } from '../components/Icon.jsx';
import { CourseForm } from '../components/CourseForm.jsx';
import { CourseArt } from '../components/CourseArt.jsx';
import { UpdateCard } from '../components/UpdateCard.jsx';
import { AgendaCard } from '../components/AgendaCard.jsx';
import { Isolated } from '../components/Isolated.jsx';
import { MissedBlocks } from '../components/MissedBlocks.jsx';
import { QuickFocus } from '../components/QuickFocus.jsx';
import { QuickNote } from '../components/QuickNote.jsx';
import { EmptyState, ErrorState, Modal, ProgressBar, Skeleton, Toast } from '../components/ui.jsx';

function NextAction({ action, onAddCourse }) {
  if (action.type === 'add_course') {
    return (
      <EmptyState icon="courses" title="Comece cadastrando seu primeiro curso"
        action={<button className="btn btn-primary" onClick={onAddCourse}>Adicionar curso</button>}>
        O cadastro é manual e leva menos de um minuto. Você acompanha o progresso por aulas ou por porcentagem.
      </EmptyState>
    );
  }
  const isResume = action.type === 'resume_session';
  const course = action.course;
  const lessonTitle = isResume ? action.lesson?.title : action.lesson?.title;
  const params = new URLSearchParams();
  if (course) params.set('course', course.id);
  if (action.lesson?.id) params.set('lesson', action.lesson.id);
  if (!isResume) params.set('auto', '1');
  const href = isResume ? '/foco' : `/foco?${params}`;
  return (
    <section className="hero" aria-label="Próxima ação">
      <CourseArt id={course?.id} imageUrl={course?.imageUrl} className="hero-art" role="img" aria-label={course ? `Capa do curso ${course.title}` : 'Ilustração do curso'} />
      <div className="hero-body">
        <span className="eyebrow">{isResume ? 'Sessão em andamento' : 'Próxima ação · hoje'}</span>
        <h2>{course?.title ?? 'Sessão livre'}</h2>
        <p style={{ margin: 0, color: 'var(--text-2)' }}>
          {lessonTitle ?? (action.type === 'continue_course' ? 'Registre seu estudo de hoje' : 'Foco livre')}
          {action.lesson?.durationMin ? ` · ${action.lesson.durationMin} min` : ''}
        </p>
        {course && (
          <div style={{ maxWidth: 360, marginTop: 14 }}>
            <ProgressBar value={course.progress} label="Progresso do curso" />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{course.progress}% do curso</div>
          </div>
        )}
        <div className="row" style={{ marginTop: 18 }}>
          <Link to={href} className="btn btn-primary btn-lg">
            <Icon name="play" size={16} />{isResume ? 'Voltar para a sessão' : 'Continuar'}
          </Link>
          {course && <Link to={`/cursos/${course.id}`} className="btn">Ver curso</Link>}
        </div>
      </div>
    </section>
  );
}

function GoalEditor({ goal, onClose, onSaved }) {
  const [hours, setHours] = useState(String(goal.targetMinutes / 60));
  const [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault();
    const minutes = Math.round(Number(hours.replace(',', '.')) * 60);
    try {
      await api.setWeeklyGoal(minutes);
      onSaved();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <Modal title="Ajustar meta semanal" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        <div className="field">
          <label htmlFor="goal-hours">Horas por semana</label>
          <input id="goal-hours" className="input" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
          <span className="muted" style={{ fontSize: 12 }}>Metas flexíveis: ajuste quando a semana pedir.</span>
        </div>
        {error && <div className="alert error" role="alert">{error.details?.[0]?.message ?? error.message}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Salvar meta</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Dashboard() {
  const { data, error, loading, reload, refetch } = useAsync(() => api.dashboard(), []);
  const [adding, setAdding] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [toast, showToast] = useToast();
  const navigate = useNavigate();

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (loading || !data) {
    return (
      <>
        <Skeleton height={48} style={{ maxWidth: 420 }} />
        <Skeleton height={190} />
        <div className="stats"><Skeleton height={100} /><Skeleton height={100} /></div>
      </>
    );
  }

  const { week, goal, streakDays, activeCourses, nextAction, recentSessions } = data;
  const max = Math.max(60, ...week.chart.map((d) => d.minutes));
  const todayIdx = week.chart.findIndex((d) => d.date === new Date(data.generatedAt).toLocaleDateString('en-CA'));

  return (
    <>
      <header>
        <h1 className="page-title">{greeting()}! Vamos continuar?</h1>
        <p className="page-sub">Disciplina hoje, resultados amanhã. Sua próxima ação já está pronta.</p>
      </header>

      <UpdateCard />

      <div className="dash-top">
        <NextAction action={nextAction} onAddCourse={() => setAdding(true)} />
        <section className="stats" aria-label="Resumo da semana">
          <div className="card stat">
            <div className="stat-label">Horas esta semana</div>
            <div className="stat-value">{formatMinutes(week.studiedMinutes)}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: week.deltaPercent >= 0 ? 'var(--green)' : 'var(--text-3)' }}>
              {week.deltaPercent === null ? 'Primeira semana de dados' : `${week.deltaPercent >= 0 ? '▲' : '▼'} ${Math.abs(week.deltaPercent)}% vs. semana anterior`}
            </div>
          </div>
          <div className="card stat">
            <div className="stat-label">Meta semanal</div>
            <div className="stat-value">{formatMinutes(goal.studiedMinutes)} <small>/ {formatMinutes(goal.targetMinutes)}</small></div>
            <div style={{ marginTop: 10 }}><ProgressBar value={goal.percent} label="Progresso da meta semanal" /></div>
            <button className="btn btn-ghost btn-sm" style={{ padding: 0, minHeight: 32, marginTop: 4 }} onClick={() => setEditingGoal(true)}>Ajustar meta</button>
          </div>
          <div className="card stat">
            <div className="stat-label">Sequência</div>
            <div className="stat-value">{streakDays} {streakDays === 1 ? 'dia' : 'dias'}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{streakDays > 0 ? 'Continue de onde parou.' : 'Estude hoje para começar.'}</div>
          </div>
          <div className="card stat">
            <div className="stat-label">Cursos ativos</div>
            <div className="stat-value">{activeCourses}</div>
            <Link to="/cursos" className="more" style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-text)' }}>Ver todos</Link>
          </div>
        </section>
      </div>

      <Isolated><MissedBlocks /></Isolated>
      <Isolated><QuickFocus nextAction={nextAction} /></Isolated>
      <AgendaCard />
      <Isolated><QuickNote defaultCourseId={nextAction.course?.id ?? null} /></Isolated>

      <div className="dash-bottom">
        <section className="card" aria-label="Horas por dia">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 className="card-title">Esta semana</h2>
            <span className="muted" style={{ fontSize: 12 }}>{formatMinutes(week.studiedMinutes)} no total</span>
          </div>
          <div className="chart" role="img" aria-label={`Minutos estudados por dia: ${week.chart.map((d) => `${d.label} ${d.minutes}`).join(', ')}`}>
            {week.chart.map((d, i) => (
              <div key={d.date} className={`chart-col${i === todayIdx ? ' today' : ''}`} title={`${d.label}: ${formatMinutes(d.minutes)}`}>
                <div className="chart-bar" style={{ height: `${Math.max(3, (d.minutes / max) * 100)}%` }} />
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card" aria-label="Histórico recente">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="card-title">Histórico recente</h2>
          </div>
          {recentSessions.length === 0 ? (
            <p className="muted" style={{ margin: '14px 0 0' }}>Suas sessões de estudo vão aparecer aqui.</p>
          ) : (
            <ul className="history">
              {recentSessions.map((s) => (
                <li key={s.id}>
                  <span className="dot" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {s.kind === 'manual' ? 'Registro manual' : 'Sessão de foco'}
                    {s.courseTitle ? ` · ${s.courseTitle}` : ''}
                  </span>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>{formatMinutes(s.durationSec / 60)} · {relativeDay(s.startedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {adding && (
        <CourseForm onClose={() => setAdding(false)} onSaved={(c) => { setAdding(false); showToast('Curso adicionado'); navigate(`/cursos/${c.id}`); }} />
      )}
      {editingGoal && (
        <GoalEditor goal={goal} onClose={() => setEditingGoal(false)} onSaved={() => { setEditingGoal(false); showToast('Meta atualizada'); reload(); }} />
      )}
      <Toast message={toast} />
    </>
  );
}
