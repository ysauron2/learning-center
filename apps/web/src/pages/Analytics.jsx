import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { formatMinutes } from '../lib/format.js';
import {
  RANGES, PERIOD_LABEL, PERIOD_HOURS, WEEKDAYS,
  barHeights, heatLevel, deltaText, shortDate, tickLabels, ratingText, hitCount,
} from '../lib/analytics.js';
import { EmptyState, ErrorState, ProgressBar, Skeleton } from '../components/ui.jsx';

const KIND_LABEL = { pomodoro: 'Pomodoro', stopwatch: 'Cronômetro', manual: 'Registro manual' };

function Kpi({ label, value, hint }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Timeline({ timeline, granularity }) {
  const heights = barHeights(timeline.map((t) => t.minutes));
  const labels = tickLabels(timeline.map((t) => t.date), timeline.length > 14 ? Math.ceil(timeline.length / 6) : 1);
  const unit = granularity === 'week' ? 'semana de ' : '';
  const summary = timeline.map((t) => `${unit}${shortDate(t.date)} ${formatMinutes(t.minutes)}`).join(', ');
  return (
    <>
      <div className="chart dense" role="img" aria-label={`Tempo estudado por ${granularity === 'week' ? 'semana' : 'dia'}: ${summary}`}>
        {timeline.map((t, i) => (
          <div key={t.date} className="chart-col" title={`${unit}${shortDate(t.date)}: ${formatMinutes(t.minutes)}`}>
            <div className="chart-bar" style={{ height: `${heights[i]}%`, opacity: t.minutes ? 1 : 0.35 }} />
            <span>{labels[i]}</span>
          </div>
        ))}
      </div>
      <details style={{ marginTop: 10 }}>
        <summary className="muted">Ver como tabela</summary>
        <table className="an-table">
          <thead><tr><th scope="col">{granularity === 'week' ? 'Semana de' : 'Dia'}</th><th scope="col">Tempo</th></tr></thead>
          <tbody>
            {timeline.map((t) => <tr key={t.date}><td>{shortDate(t.date)}</td><td>{formatMinutes(t.minutes)}</td></tr>)}
          </tbody>
        </table>
      </details>
    </>
  );
}

function Heatmap({ data }) {
  const max = Math.max(0, ...data.matrix.flat());
  if (max === 0) return <p className="muted" style={{ margin: '14px 0 0' }}>Sem sessões de foco neste período. Registros manuais não têm horário.</p>;
  return (
    <table className="heat">
      <caption className="sr-only">Minutos estudados por dia da semana e faixa do dia</caption>
      <thead>
        <tr>
          <td />
          {data.periods.map((p) => (
            <th key={p} scope="col">{PERIOD_LABEL[p]}<small>{PERIOD_HOURS[p]}</small></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.matrix.map((row, d) => (
          <tr key={WEEKDAYS[d]}>
            <th scope="row">{WEEKDAYS[d]}</th>
            {row.map((m, p) => (
              <td key={data.periods[p]} className="heat-cell" data-level={heatLevel(m, max)} title={`${WEEKDAYS[d]}, ${PERIOD_LABEL[data.periods[p]]}: ${formatMinutes(m)}`}>
                <span className="sr-only">{formatMinutes(m)}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Goals({ history }) {
  const heights = barHeights(history.map((w) => (w.target ? (w.minutes / w.target) * 100 : 0)), { max: 100 });
  const hits = hitCount(history);
  return (
    <>
      <div className="chart dense" style={{ height: 110 }} role="img"
        aria-label={`Meta semanal batida em ${hits} das últimas ${history.length} semanas`}>
        {history.map((w, i) => (
          <div key={w.weekStart} className={`chart-col${w.hit ? ' today' : ''}`}
            title={`Semana de ${shortDate(w.weekStart)}: ${formatMinutes(w.minutes)} de ${formatMinutes(w.target)}${w.hit ? ' (meta batida)' : ''}`}>
            <div className="chart-bar" style={{ height: `${heights[i]}%` }} />
          </div>
        ))}
      </div>
      <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
        Meta batida em {hits} de {history.length} semanas (barras roxas). Usa a meta atual em todas as semanas.
      </p>
    </>
  );
}

export default function Analytics() {
  const [range, setRange] = useState('30d');
  const { data, error, loading, refetch } = useAsync(() => api.analytics(range), [range]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">Como, quando e no que você estuda.</p>
        </div>
        <div className="row" role="group" aria-label="Período" style={{ gap: 8 }}>
          {RANGES.map(([value, label]) => (
            <button key={value} className="chip" aria-pressed={range === value} onClick={() => setRange(value)}>{label}</button>
          ))}
        </div>
      </header>

      {error && <ErrorState error={error} onRetry={refetch} />}
      {loading && !data && <Skeleton height={340} />}

      {data && (
        <div style={{ opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
          {data.summary.sessions === 0 && (
            <EmptyState icon="chart" title="Ainda sem estudo neste período">
              Faça uma sessão de foco ou registre um tempo manual, e os números aparecem aqui.
            </EmptyState>
          )}

          <section className="an-kpis" aria-label="Resumo">
            <Kpi label="Tempo estudado" value={formatMinutes(data.summary.totalMinutes)} hint={deltaText(data.summary.deltaPercent)} />
            <Kpi label="Sessões" value={data.summary.sessions} hint={`${data.summary.activeDays} dia(s) com estudo`} />
            <Kpi label="Média por dia de estudo" value={formatMinutes(data.summary.avgMinutesPerActiveDay)}
              hint={data.summary.bestDay ? `Melhor dia: ${shortDate(data.summary.bestDay.date)} (${formatMinutes(data.summary.bestDay.minutes)})` : 'Sem dados'} />
            <Kpi label="Sequência" value={`${data.summary.currentStreak} ${data.summary.currentStreak === 1 ? 'dia' : 'dias'}`}
              hint={`Recorde: ${data.summary.longestStreak} ${data.summary.longestStreak === 1 ? 'dia' : 'dias'}`} />
          </section>

          <div className="an-grid">
            <section className="card an-wide" aria-label="Evolução">
              <h2 className="card-title">Evolução {data.granularity === 'week' ? '(por semana)' : '(por dia)'}</h2>
              <Timeline timeline={data.timeline} granularity={data.granularity} />
            </section>

            <section className="card" aria-label="Por curso">
              <h2 className="card-title">Por curso</h2>
              {data.byCourse.length === 0 ? (
                <p className="muted" style={{ margin: '14px 0 0' }}>Nenhum curso estudado neste período.</p>
              ) : (
                <ul className="an-list">
                  {data.byCourse.map((c) => (
                    <li key={c.courseId ?? 'none'}>
                      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                        {c.courseId ? <Link to={`/cursos/${c.courseId}`}><strong>{c.title}</strong></Link> : <strong>{c.title}</strong>}
                        <span className="muted" style={{ fontSize: 13 }}>{formatMinutes(c.minutes)} · {c.percent}%</span>
                      </div>
                      <ProgressBar value={c.percent} tone="blue" label={`${c.title}: ${c.percent}% do tempo`} />
                      {c.progress !== null && <span className="muted" style={{ fontSize: 12 }}>Curso em {c.progress}%</span>}
                    </li>
                  ))}
                </ul>
              )}
              {data.idleCourses.length > 0 && (
                <>
                  <h3 className="an-sub">Cursos ativos sem estudo no período</h3>
                  <ul className="an-list">
                    {data.idleCourses.map((c) => (
                      <li key={c.courseId} className="row" style={{ justifyContent: 'space-between' }}>
                        <Link to={`/cursos/${c.courseId}`}>{c.title}</Link>
                        <span className="muted" style={{ fontSize: 13 }}>
                          {c.daysSince === null ? 'nunca estudado' : c.daysSince === 0 ? 'estudado hoje' : `há ${c.daysSince} dia(s)`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="card" aria-label="Quando você estuda">
              <h2 className="card-title">Quando você estuda</h2>
              <Heatmap data={data.weekdayPeriods} />
            </section>

            <section className="card" aria-label="Foco">
              <h2 className="card-title">Foco</h2>
              <dl className="an-dl">
                <div><dt>Nota média</dt><dd>{ratingText(data.focus.avgRating)}</dd></div>
                <div><dt>Melhor horário</dt><dd>{data.focus.bestPeriod ? PERIOD_LABEL[data.focus.bestPeriod] : '—'}</dd></div>
                <div><dt>Duração média da sessão</dt><dd>{formatMinutes(data.focus.avgSessionMinutes)}</dd></div>
              </dl>
              {data.focus.ratedSessions === 0 && (
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>Dê uma nota de foco ao finalizar sessões para ver o melhor horário.</p>
              )}
              <h3 className="an-sub">Tipos de sessão</h3>
              <ul className="an-list">
                {Object.entries(data.focus.kinds).map(([k, n]) => (
                  <li key={k} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{KIND_LABEL[k]}</span><span className="muted">{n}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card" aria-label="Meta semanal">
              <h2 className="card-title">Meta semanal · últimas 12 semanas</h2>
              <Goals history={data.goalHistory} />
            </section>
          </div>
        </div>
      )}
    </>
  );
}
