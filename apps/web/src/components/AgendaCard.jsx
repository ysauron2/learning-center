import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { eventDayKey, eventIcon, groupByDay, nextDays, relativeSync, startsIn, timeRange } from '../lib/calendar.js';
import { Skeleton } from './ui.jsx';

/** Resumo do que foi feito numa sincronização, em português. */
export function syncSummaryText(r) {
  const parts = [];
  if (r.planCreated) parts.push(`${r.planCreated} ${r.planCreated === 1 ? 'bloco de estudo criado' : 'blocos de estudo criados'}`);
  if (r.planUpdated) parts.push(`${r.planUpdated} ${r.planUpdated === 1 ? 'atualizado' : 'atualizados'}`);
  if (r.planDeleted) parts.push(`${r.planDeleted} ${r.planDeleted === 1 ? 'removido' : 'removidos'}`);
  if (r.sessionsCreated) parts.push(`${r.sessionsCreated} ${r.sessionsCreated === 1 ? 'sessão registrada' : 'sessões registradas'}`);
  return parts.length ? `Sincronizado: ${parts.join(', ')}.` : 'Tudo já estava sincronizado.';
}

/** Agenda do início quando não há Google: a semana inteira de relance e o próximo bloco de estudo em destaque. */
function LocalAgenda({ events, notion, syncing, onSync, message, error }) {
  const now = new Date();
  const plan = events.filter((e) => e.kind === 'plan');
  const next = plan.find((e) => new Date(e.end) > now);
  const days = nextDays(7, now);
  const byDay = new Map(days.map((d) => [d.key, []]));
  for (const e of events) byDay.get(eventDayKey(e))?.push(e);
  const focusHref = next?.courseId ? `/foco?course=${next.courseId}&auto=1` : '/foco';

  return (
    <div className="agenda-local">
      <div className="row agenda-sources" style={{ gap: 8, flexWrap: 'wrap' }}>
        {notion && <span className="chip">✅ Notion · {relativeSync(notion.lastSyncAt)}</span>}
        <span className="muted" style={{ fontSize: 12 }}>
          {notion ? 'Seus horários vão sozinhos para o Notion e o Notion Calendar.' : 'Quer ver isso no seu calendário? Conecte em Agenda.'}
        </span>
      </div>

      {next ? (
        <div className="agenda-next" aria-label="Próximo bloco de estudo">
          <div style={{ minWidth: 0 }}>
            <div className="agenda-next-when">{startsIn(next, now)} · {timeRange(next)}</div>
            <div className="agenda-next-title">{next.title}</div>
            {next.lessonTitle && <div className="muted" style={{ fontSize: 13 }}>Próxima aula: {next.lessonTitle}</div>}
          </div>
          <Link className="btn btn-primary" to={focusHref}>Começar agora</Link>
        </div>
      ) : (
        <div className="agenda-next empty">
          <div>
            <div className="agenda-next-title">{plan.length === 0 && events.length === 0 ? 'Você ainda não montou seu plano de estudo.' : 'Nada mais planejado para esta semana.'}</div>
            <div className="muted" style={{ fontSize: 13 }}>Escolha dias e horários e eles aparecem aqui{notion ? ' e no Notion' : ''}.</div>
          </div>
          <Link className="btn btn-primary" to="/agenda">Montar plano de estudo</Link>
        </div>
      )}

      <ol className="week-strip" aria-label="Próximos 7 dias">
        {days.map((d) => {
          const items = byDay.get(d.key) ?? [];
          return (
            <li key={d.key} className={`week-day${d.isToday ? ' today' : ''}${items.length ? ' has' : ''}`}>
              <span className="week-day-name">{d.isToday ? 'hoje' : d.weekday}</span>
              <span className="week-day-date">{d.date}</span>
              {items.length === 0 && <span className="week-day-empty" aria-label="sem estudo planejado">–</span>}
              {items.map((e) => (
                <span key={e.id} className={`week-item ${e.kind}`} title={e.title}>
                  {eventIcon(e)} {e.kind === 'session' ? 'feito' : timeRange(e).slice(0, 5)}
                </span>
              ))}
            </li>
          );
        })}
      </ol>

      {message && <p role="status" aria-live="polite" className="muted" style={{ margin: 0 }}>{message}</p>}
      {error && <p role="alert" className="alert error" style={{ margin: 0 }}>{error.message}</p>}
      {notion?.lastError && !error && <p role="alert" className="alert error" style={{ margin: 0 }}>{notion.lastError}</p>}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Link className="btn btn-sm" to="/agenda">Editar plano</Link>
        {notion && <button className="btn btn-sm" onClick={onSync} disabled={syncing}>{syncing ? 'Sincronizando…' : 'Sincronizar Notion'}</button>}
        {notion?.databaseUrl && <a className="btn btn-sm" href={notion.databaseUrl} target="_blank" rel="noopener noreferrer">Abrir no Notion</a>}
      </div>
    </div>
  );
}

/** Google Agenda no início: convida a conectar ou mostra os próximos 7 dias, com os blocos de estudo em destaque. */
export function AgendaCard() {
  const status = useAsync(() => api.calendarStatus(), []);
  const connected = status.data?.connected === true;
  // o Notion é opcional: se o estado dele não carregar, o cartão segue sem ele
  const notion = useAsync(async () => { try { return await api.notionStatus(); } catch { return null; } }, []);
  const nt = notion.data?.connected === true ? notion.data : null;
  // o que o app já sabe (plano de estudo + sessões de hoje), sem depender do Google
  const upcoming = useAsync(async () => { try { return await api.calendarUpcoming(7); } catch { return []; } }, []);
  const local = upcoming.data ?? [];
  const events = useAsync(() => (connected ? api.calendarEvents(7) : Promise.resolve(null)), [connected]);
  const [live, setLive] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function syncNow() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.calendarSync();
      setLive(await api.calendarEvents(7, true));
      setMessage(syncSummaryText(result));
      status.reload();
    } catch (err) {
      setError(err);
    } finally {
      setSyncing(false);
    }
  }

  const st = status.data;
  const data = live ?? events.data;
  const showLocal = Boolean(st && !st.connected && (nt || local.length > 0));
  const [syncingNotion, setSyncingNotion] = useState(false);

  async function syncNotion() {
    setSyncingNotion(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(`Notion · ${syncSummaryText(await api.notionSync())}`);
      notion.reload();
      upcoming.reload();
    } catch (err) {
      setError(err);
    } finally {
      setSyncingNotion(false);
    }
  }

  return (
    <section className="card agenda-card" aria-label="Google Agenda">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="card-title">Sua agenda</h2>
          {st?.connected && <div className="muted" style={{ fontSize: 12 }}>{st.account ?? 'Google Agenda'} · {relativeSync(st.lastSyncAt)}</div>}
        </div>
        {st?.connected && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={syncNow} disabled={syncing}>{syncing ? 'Sincronizando…' : 'Sincronizar agora'}</button>
            <Link className="btn btn-sm" to="/agenda">Plano de estudo</Link>
          </div>
        )}
      </div>

      {status.loading && !st && <Skeleton height={90} style={{ marginTop: 12 }} />}
      {status.error && <p className="muted" style={{ margin: '12px 0 0' }}>Não foi possível ver o estado do Google Agenda.</p>}

      {showLocal && (
        <LocalAgenda events={local} notion={nt} syncing={syncingNotion} onSync={syncNotion} message={message} error={error} />
      )}

      {st && !st.connected && !showLocal && (
        <div className="agenda-cta">
          <p style={{ margin: 0 }}>
            {st.configured
              ? 'Falta só autorizar o acesso. Depois, seus compromissos e horários de estudo aparecem aqui.'
              : 'Coloque seus horários de estudo na sua agenda: no Calendário da Apple (sem conta nenhuma), no Notion (um código só) ou no Google Agenda, que também mostra seus compromissos aqui.'}
          </p>
          <Link className="btn btn-primary" to="/agenda">{st.configured ? 'Autorizar o Google Agenda' : 'Configurar a agenda'}</Link>
          {st.lastError && <p className="alert error" role="alert" style={{ margin: 0 }}>{st.lastError}</p>}
        </div>
      )}

      {st?.connected && (
        <>
          {message && <p role="status" aria-live="polite" className="muted" style={{ margin: '10px 0 0' }}>{message}</p>}
          {error && <p role="alert" className="alert error" style={{ margin: '10px 0 0' }}>{error.message}</p>}
          {st.lastError && !error && <p role="alert" className="alert error" style={{ margin: '10px 0 0' }}>{st.lastError}</p>}
          {events.loading && !data && <Skeleton height={120} style={{ marginTop: 12 }} />}
          {data?.error && (
            <p className="muted" style={{ margin: '10px 0 0' }}>
              {data.stale ? 'Mostrando a última lista que o app conseguiu ler. ' : ''}Não foi possível atualizar agora: {data.error}
            </p>
          )}
          {data && data.events.length === 0 && !data.error && (
            <p className="muted" style={{ margin: '12px 0 0' }}>Nada na sua agenda nos próximos 7 dias. Que tal planejar seus estudos?</p>
          )}
          {data && data.events.length > 0 && (
            <div className="agenda-days">
              {groupByDay(data.events).map((day) => (
                <div key={day.key} className="agenda-day">
                  <h3>{day.label}</h3>
                  <ul>
                    {day.events.map((e) => (
                      <li key={e.id} className={e.calendar === 'study' ? 'study' : ''}>
                        <span className="agenda-time">{timeRange(e)}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a> : e.title}
                        </span>
                        {eventIcon(e) && <span aria-hidden="true">{eventIcon(e)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
