import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { formatClock, formatMinutes } from '../lib/format.js';
import { Icon } from '../components/Icon.jsx';
import { ErrorState, ProgressBar, Skeleton } from '../components/ui.jsx';

const CIRC = 2 * Math.PI * 154;

function StartForm({ initialCourse, initialLesson, onStart, error }) {
  const courses = useAsync(() => api.courses({}), []);
  const [courseId, setCourseId] = useState(initialCourse ?? '');
  const [lessonId, setLessonId] = useState(initialLesson ?? '');
  const [kind, setKind] = useState('pomodoro');
  const [plannedMin, setPlannedMin] = useState(25);
  const detail = useAsync(() => (courseId ? api.course(courseId) : Promise.resolve(null)), [courseId]);
  const lessons = (detail.data?.modules ?? []).flatMap((m) => m.lessons.filter((l) => !l.completed).map((l) => ({ ...l, module: m.title })));

  return (
    <form className="card start-card" onSubmit={(e) => { e.preventDefault(); onStart({ courseId: courseId ? Number(courseId) : null, lessonId: lessonId ? Number(lessonId) : null, kind, plannedMin }); }}
      style={{ display: 'grid', gap: 18 }}>
      <div>
        <h1 className="page-title" style={{ fontSize: 26 }}>Nova sessão de foco</h1>
        <p className="page-sub">Escolha o que vai estudar e comece. Uma coisa de cada vez.</p>
      </div>
      <div className="field">
        <label htmlFor="fs-course">Conteúdo</label>
        <select id="fs-course" className="select" value={courseId} onChange={(e) => { setCourseId(e.target.value); setLessonId(''); }}>
          <option value="">Estudo livre (sem curso)</option>
          {courses.data?.filter((c) => c.status !== 'completed').map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>
      {courseId && lessons.length > 0 && (
        <div className="field">
          <label htmlFor="fs-lesson">Aula (opcional)</label>
          <select id="fs-lesson" className="select" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            <option value="">Sem aula específica</option>
            {lessons.map((l) => <option key={l.id} value={l.id}>{l.module} · {l.title}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <span className="label" id="fs-kind-label">Tipo</span>
        <div className="segmented" role="group" aria-labelledby="fs-kind-label" style={{ alignSelf: 'flex-start' }}>
          <button type="button" aria-pressed={kind === 'pomodoro'} onClick={() => setKind('pomodoro')}>Pomodoro</button>
          <button type="button" aria-pressed={kind === 'stopwatch'} onClick={() => setKind('stopwatch')}>Cronômetro</button>
        </div>
      </div>
      {kind === 'pomodoro' && (
        <div className="field">
          <span className="label" id="fs-len-label">Duração</span>
          <div className="row" role="group" aria-labelledby="fs-len-label" style={{ gap: 8 }}>
            {[15, 25, 45, 50].map((m) => <button type="button" key={m} className="chip" aria-pressed={plannedMin === m} onClick={() => setPlannedMin(m)}>{m} min</button>)}
          </div>
        </div>
      )}
      {error && <div className="alert error" role="alert">{error.message}</div>}
      <button className="btn btn-primary btn-lg" type="submit"><Icon name="play" size={16} />Iniciar sessão</button>
    </form>
  );
}

function FinishForm({ session, onCancel, onFinish, onDiscard, busy }) {
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(null);
  const [complete, setComplete] = useState(false);
  return (
    <form className="card start-card" onSubmit={(e) => { e.preventDefault(); onFinish({ notes, focusRating: rating, completeLesson: complete }); }} style={{ display: 'grid', gap: 18 }}>
      <h2 className="page-title" style={{ fontSize: 24 }}>Finalizar sessão</h2>
      <div className="field">
        <span className="label" id="ff-rating">Como foi o foco? (opcional)</span>
        <div className="rating" role="group" aria-labelledby="ff-rating">
          {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} aria-pressed={rating === n} aria-label={`${n} de 5`} onClick={() => setRating(rating === n ? null : n)}>{n}</button>)}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>1 = muito disperso · 5 = foco total</span>
      </div>
      <div className="field">
        <label htmlFor="ff-notes">Anotação rápida (opcional)</label>
        <textarea id="ff-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que ficou claro? O que revisar?" />
      </div>
      {session.lessonId && (
        <label className="row" style={{ gap: 10, fontSize: 14 }}>
          <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} style={{ width: 20, height: 20 }} />
          Marcar “{session.lessonTitle}” como concluída
        </label>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>Salvar sessão</button>
        <button className="btn" type="button" onClick={onCancel}>Voltar ao timer</button>
        <button className="btn btn-ghost" type="button" onClick={onDiscard} style={{ color: 'var(--danger)' }}>Descartar</button>
      </div>
    </form>
  );
}

function Summary({ done, goal, onRestart }) {
  const navigate = useNavigate();
  return (
    <div className="card start-card" style={{ textAlign: 'center', display: 'grid', gap: 16, justifyItems: 'center' }}>
      <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff' }}>
        <Icon name="check" size={26} strokeWidth={3} />
      </div>
      <h1 className="page-title" style={{ fontSize: 26 }}>Sessão registrada</h1>
      <p className="page-sub" style={{ margin: 0 }}>
        Você estudou <b style={{ color: 'var(--text)' }}>{formatMinutes(done.durationSec / 60) === '0min' ? 'menos de 1 minuto' : formatMinutes(done.durationSec / 60)}</b>
        {done.courseTitle ? ` em ${done.courseTitle}` : ''}.
      </p>
      {goal && (
        <div style={{ width: '100%', textAlign: 'left', background: 'var(--surface-2)', borderRadius: 14, padding: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'var(--text-2)' }}>
            <span>Meta semanal</span><b style={{ color: 'var(--text)' }}>{formatMinutes(goal.studiedMinutes)} / {formatMinutes(goal.targetMinutes)}</b>
          </div>
          <ProgressBar value={goal.percent} label="Meta semanal" />
        </div>
      )}
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Ver meu progresso</button>
        <button className="btn" onClick={onRestart}>Nova sessão</button>
      </div>
    </div>
  );
}

export default function Focus() {
  const [params, setParams] = useSearchParams();
  const [phase, setPhase] = useState('loading'); // loading | idle | running | finishing | done
  const [session, setSession] = useState(null);
  const [baseline, setBaseline] = useState(0); // performance.now() quando recebemos a sessão
  const [, setTick] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [goal, setGoal] = useState(null);
  const autoRan = useRef(false);

  const adopt = useCallback((s) => {
    setSession(s);
    setBaseline(performance.now());
    setPhase('running');
  }, []);

  const start = useCallback(async (payload) => {
    setError(null);
    try {
      adopt(await api.startSession(payload));
    } catch (e) {
      if (e.code === 'SESSION_ALREADY_ACTIVE' && e.details?.session) adopt(e.details.session);
      else { setError(e); setPhase('idle'); }
    }
  }, [adopt]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const active = await api.activeSession();
        if (!alive) return;
        if (active) { adopt(active); return; }
        const course = params.get('course');
        if (params.get('auto') === '1' && course && !autoRan.current) {
          autoRan.current = true;
          const lesson = params.get('lesson');
          setParams({}, { replace: true });
          await start({ courseId: Number(course), lessonId: lesson ? Number(lesson) : null, kind: 'pomodoro', plannedMin: 25 });
          return;
        }
        setPhase('idle');
      } catch (e) {
        if (alive) { setError(e); setPhase('error'); }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'running') return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [phase]);

  const control = (fn) => async () => {
    setBusy(true);
    try {
      const s = await fn(session.id);
      setSession(s);
      setBaseline(performance.now());
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  async function finish(body) {
    setBusy(true);
    try {
      const result = await api.finishSession(session.id, body);
      setDone(result);
      setGoal(await api.weeklyGoal().catch(() => null));
      setPhase('done');
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function discard() {
    if (!window.confirm('Descartar esta sessão? O tempo não será registrado.')) return;
    await api.discardSession(session.id);
    setSession(null);
    setPhase('idle');
  }

  if (phase === 'loading') return <div className="focus-page"><Skeleton height={340} style={{ width: 340, borderRadius: '50%' }} /></div>;
  if (phase === 'error') return <ErrorState error={error} onRetry={() => window.location.reload()} />;

  if (phase === 'idle') {
    return (
      <div className="focus-page">
        <StartForm initialCourse={params.get('course') ?? ''} initialLesson={params.get('lesson') ?? ''} onStart={start} error={error} />
      </div>
    );
  }
  if (phase === 'done') {
    return <div className="focus-page"><div className="focus-glow" /><Summary done={done} goal={goal} onRestart={() => { setDone(null); setSession(null); setPhase('idle'); }} /></div>;
  }
  if (phase === 'finishing') {
    return (
      <div className="focus-page">
        <FinishForm session={session} busy={busy} onCancel={() => setPhase('running')} onFinish={finish} onDiscard={discard} />
        {error && <div className="alert error" role="alert">{error.message}</div>}
      </div>
    );
  }

  // running
  const elapsed = session.elapsedSec + (session.running ? (performance.now() - baseline) / 1000 : 0);
  const isPomodoro = session.kind === 'pomodoro' && session.plannedMin;
  const total = isPomodoro ? session.plannedMin * 60 : 0;
  const remaining = isPomodoro ? Math.max(0, total - elapsed) : 0;
  const offset = isPomodoro ? CIRC * (1 - remaining / total) : CIRC * (1 - ((elapsed % 3600) / 3600));
  const clock = isPomodoro ? formatClock(Math.ceil(remaining)) : formatClock(elapsed);
  const overtime = isPomodoro && remaining === 0;
  const status = !session.running ? 'Pausado · retome quando quiser' : overtime ? 'Tempo concluído! Finalize ou continue.' : 'Em foco · só o essencial na tela';

  return (
    <div className="focus-page">
      <div className="focus-glow" aria-hidden="true" />
      <Link to="/" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}><Icon name="back" size={16} strokeWidth={2} />Sair do modo foco</Link>
      <div>
        <div className="eyebrow">Estudando agora</div>
        <h1 className="page-title" style={{ fontSize: 24, marginTop: 6 }}>{session.courseTitle ?? 'Estudo livre'}</h1>
        {session.lessonTitle && <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{session.lessonTitle}</div>}
      </div>

      <div className="timer" role="timer" aria-label={`${isPomodoro ? 'Tempo restante' : 'Tempo decorrido'}: ${clock}`}>
        <svg viewBox="0 0 340 340" aria-hidden="true">
          <defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#3b82f6" /></linearGradient></defs>
          <circle cx="170" cy="170" r="154" fill="none" stroke="var(--track)" strokeWidth="14" />
          <circle cx="170" cy="170" r="154" fill="none" stroke="url(#fg)" strokeWidth="14" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={offset} />
        </svg>
        <div className="timer-face">
          <div className="timer-clock">{clock}</div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 10, maxWidth: 220 }}>{status}</div>
        </div>
      </div>

      <div className="focus-actions">
        {session.running
          ? <button className="btn btn-primary btn-lg" onClick={control(api.pauseSession)} disabled={busy}><Icon name="pause" size={16} strokeWidth={2.4} />Pausar</button>
          : <button className="btn btn-primary btn-lg" onClick={control(api.resumeSession)} disabled={busy}><Icon name="play" size={16} />Retomar</button>}
        <button className="btn btn-lg" onClick={() => setPhase('finishing')}>Finalizar sessão</button>
      </div>
      {error && <div className="alert error" role="alert">{error.message}</div>}
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Se você sair, a sessão continua salva e pode ser retomada.</p>
    </div>
  );
}
