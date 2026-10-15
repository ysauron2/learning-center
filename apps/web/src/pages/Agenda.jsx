import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { WEEKDAYS_FULL, relativeSync } from '../lib/calendar.js';
import { syncSummaryText } from '../components/AgendaCard.jsx';
import { ErrorState, Skeleton } from '../components/ui.jsx';
import { AppleCalendar, CopyButton } from '../components/AppleCalendar.jsx';
import { NotionCalendar } from '../components/NotionCalendar.jsx';

const DURATIONS = [15, 25, 30, 45, 60, 90, 120];

function SetupGuide() {
  const redirectUri = `${window.location.origin}/api/v1/calendar/callback`;
  return (
    <details className="agenda-guide" open>
      <summary><strong>Como conectar (uma vez só, uns 5 minutos)</strong></summary>
      <p className="muted" style={{ margin: '8px 0' }}>
        O Google exige que cada pessoa crie a sua "chave" gratuita. Assim, o acesso à sua agenda fica só com você.
      </p>
      <ol>
        <li>Abra <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer">console.cloud.google.com</a>, entre com a sua conta Google e <strong>crie um projeto</strong> (pode chamar de "Learning Center").</li>
        <li>No menu, vá em <strong>APIs e serviços → Biblioteca</strong>, procure <strong>Google Calendar API</strong> e clique em <strong>Ativar</strong>.</li>
        <li>Vá em <strong>APIs e serviços → Tela de permissão OAuth</strong>. Escolha <strong>Externo</strong>, coloque um nome (ex.: Learning Center) e o seu e-mail. Em <strong>Usuários de teste</strong>, adicione o seu e-mail do Google.</li>
        <li>Em <strong>Credenciais → Criar credenciais → ID do cliente OAuth</strong>, escolha o tipo <strong>App para computador</strong> (Desktop). Copie o <strong>ID do cliente</strong> e a <strong>Chave secreta</strong>.</li>
        <li>Cole os dois aqui embaixo, clique em <strong>Salvar</strong> e depois em <strong>Conectar ao Google</strong>.</li>
      </ol>
      <div className="agenda-redirect">
        <strong>Deu "Erro 400: redirect_uri_mismatch" ao conectar?</strong> Quase sempre é porque a chave foi criada como <strong>Aplicativo da Web</strong>.
        Duas saídas: crie outra chave do tipo <strong>App para computador</strong> (nada mais a fazer), ou, na chave que você já tem, adicione este endereço em
        <strong> URIs de redirecionamento autorizados</strong>, salve e espere uns minutos:
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <code className="agenda-url">{redirectUri}</code>
          <CopyButton text={redirectUri} />
        </div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Dica: enquanto o projeto está em "Teste", o Google desconecta a cada 7 dias. Para evitar, em <strong>Tela de permissão OAuth</strong> clique em <strong>Publicar app</strong>. Vai aparecer um aviso de "app não verificado" ao conectar, e pode seguir, porque o app é seu.
      </p>
    </details>
  );
}

function ConfigForm({ initialId = '', onSaved, compact }) {
  const [clientId, setClientId] = useState(initialId);
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.calendarConfig({ clientId, clientSecret });
      setClientSecret('');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="agenda-form" aria-label="Chave do Google" style={{ display: 'grid', gap: 12 }}>
      <div className="field">
        <label htmlFor="ag-id">ID do cliente</label>
        <input id="ag-id" className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="123456-abc.apps.googleusercontent.com" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="ag-secret">Chave secreta</label>
        <input id="ag-secret" className="input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={compact ? 'Digite para trocar' : 'GOCSPX-…'} autoComplete="off" />
      </div>
      {error && <p className="alert error" role="alert" style={{ margin: 0 }}>{error.details?.[0]?.message ?? error.message}</p>}
      <div><button className="btn btn-primary" type="submit" disabled={busy || !clientId.trim() || !clientSecret.trim()}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
    </form>
  );
}

function PlanSection({ connected, courses, onChanged }) {
  const plan = useAsync(() => api.calendarPlan(), []);
  const [form, setForm] = useState({ weekday: '0', startTime: '19:00', durationMin: '60', courseId: '' });
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  /** Depois de mexer no plano, manda para o Google Agenda e/ou o Notion na hora (os que estiverem conectados). */
  async function afterChange() {
    plan.reload();
    onChanged();
    const targets = [];
    if (connected) targets.push(['Google Agenda', () => api.calendarSync()]);
    try {
      if ((await api.notionStatus())?.connected === true) targets.push(['Notion', () => api.notionSync()]);
    } catch {
      // sem o estado do Notion, só não enviamos para lá
    }
    if (!targets.length) { setInfo('Plano salvo. No Calendário da Apple ele aparece sozinho; para aparecer no Notion ou no Google Agenda, conecte-os.'); return; }
    const sent = [];
    const failed = [];
    for (const [name, send] of targets) {
      try {
        await send();
        sent.push(name);
      } catch (err) {
        failed.push(`não foi possível enviar ao ${name}: ${err.message}`);
      }
    }
    if (sent.length) setInfo(`Plano salvo e enviado ao ${sent.join(' e ao ')}.`);
    if (failed.length) setError(new Error(`O plano foi salvo, mas ${failed.join('; ')}`));
  }

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await api.addPlanBlock({
        weekday: Number(form.weekday),
        startTime: form.startTime,
        durationMin: Number(form.durationMin),
        courseId: form.courseId ? Number(form.courseId) : null,
      });
      await afterChange();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(block) {
    if (!window.confirm(`Tirar do plano: ${WEEKDAYS_FULL[block.weekday]}, ${block.startTime}?`)) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await api.removePlanBlock(block.id);
      await afterChange();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label="Plano de estudo">
      <h2 className="card-title">Plano de estudo da semana</h2>
      <p className="muted" style={{ margin: '6px 0 14px' }}>
        Escolha os dias e horários em que quer estudar. Cada bloco aparece sozinho, nas próximas 4 semanas e com o nome do curso, no Calendário da Apple (se você assinou), no Notion e no Google Agenda (os que você conectar).
      </p>

      {plan.loading && !plan.data && <Skeleton height={80} />}
      {plan.error && <ErrorState error={plan.error} onRetry={plan.refetch} />}
      {plan.data && plan.data.length === 0 && <p className="muted">Nenhum bloco ainda. Adicione o primeiro abaixo.</p>}
      {plan.data && plan.data.length > 0 && (
        <ul className="plan-list">
          {plan.data.map((b) => (
            <li key={b.id}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{WEEKDAYS_FULL[b.weekday]}</strong> às {b.startTime} · {b.durationMin} min
                <span className="muted" style={{ display: 'block', fontSize: 13 }}>{b.courseTitle ?? 'Qualquer curso'}</span>
              </span>
              <button className="btn btn-sm" disabled={busy} onClick={() => remove(b)} aria-label={`Tirar do plano: ${WEEKDAYS_FULL[b.weekday]} às ${b.startTime}`}>Tirar</button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} aria-label="Adicionar bloco de estudo" className="plan-form">
        <div className="field">
          <label htmlFor="pl-day">Dia</label>
          <select id="pl-day" className="select" value={form.weekday} onChange={set('weekday')}>
            {WEEKDAYS_FULL.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pl-time">Horário</label>
          <input id="pl-time" className="input" type="time" value={form.startTime} onChange={set('startTime')} required />
        </div>
        <div className="field">
          <label htmlFor="pl-dur">Duração</label>
          <select id="pl-dur" className="select" value={form.durationMin} onChange={set('durationMin')}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="pl-course">Curso (opcional)</label>
          <select id="pl-course" className="select" value={form.courseId} onChange={set('courseId')}>
            <option value="">Qualquer curso</option>
            {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || !form.startTime}>Adicionar ao plano</button>
      </form>
      {info && <p role="status" aria-live="polite" className="muted" style={{ margin: '12px 0 0' }}>{info}</p>}
      {error && <p role="alert" className="alert error" style={{ margin: '12px 0 0' }}>{error.details?.[0]?.message ?? error.message}</p>}
    </section>
  );
}

export default function Agenda() {
  const [sp] = useSearchParams();
  const status = useAsync(() => api.calendarStatus(), []);
  const courses = useAsync(() => api.courses(), []);
  const [editingKey, setEditingKey] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(sp.get('conectado') ? 'Google Agenda conectado! Agora monte seu plano de estudo abaixo.' : null);
  const [busy, setBusy] = useState(false);
  const st = status.data;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.calendarConnect();
      window.location.assign(url);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar o Google Agenda? Os eventos que já estão lá continuam; o app só para de sincronizar.')) return;
    setBusy(true);
    setError(null);
    try {
      await api.calendarDisconnect();
      setMessage('Google Agenda desconectado.');
      status.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(syncSummaryText(await api.calendarSync()));
      status.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(patch) {
    setError(null);
    try {
      await api.calendarSettings(patch);
      status.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-sub">Coloque seus horários de estudo na agenda que você já usa: Calendário da Apple (o mais fácil), Notion (um código só) ou Google Agenda (o mais trabalhoso).</p>
        </div>
        <Link className="btn" to="/">Voltar ao início</Link>
      </header>

      <AppleCalendar />

      <NotionCalendar onMessage={setMessage} />

      {status.loading && !st && <Skeleton height={200} />}
      {status.error && <ErrorState error={status.error} onRetry={status.refetch} />}
      {message && <p role="status" aria-live="polite" className="card" style={{ margin: 0 }}>{message}</p>}
      {error && <p role="alert" className="alert error" style={{ margin: 0 }}>{error.message}</p>}

      {st && (
        <section className="card" aria-label="Conexão com o Google Agenda">
          <h2 className="card-title">Google Agenda · avançado</h2>

          {!st.configured && (
            <>
              <SetupGuide />
              <ConfigForm onSaved={() => { setMessage('Chave salva. Agora clique em "Conectar ao Google".'); status.reload(); }} />
            </>
          )}

          {st.configured && !st.connected && (
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <p style={{ margin: 0 }}>A chave está salva. Falta autorizar o acesso à sua agenda.</p>
              {st.lastError && <p className="alert error" role="alert" style={{ margin: 0 }}>{st.lastError}</p>}
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-primary" onClick={connect} disabled={busy}>Conectar ao Google</button>
                <button className="btn" onClick={() => setEditingKey((v) => !v)}>{editingKey ? 'Fechar' : 'Trocar a chave'}</button>
              </div>
              {editingKey && <ConfigForm initialId={st.clientId} compact onSaved={() => { setEditingKey(false); setMessage('Chave atualizada.'); status.reload(); }} />}
              <SetupGuide />
            </div>
          )}

          {st.connected && (
            <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
              <p style={{ margin: 0 }}>✅ Conectado como <strong>{st.account ?? 'sua conta Google'}</strong>. Última sincronização: {relativeSync(st.lastSyncAt)}.</p>
              {st.lastError && <p className="alert error" role="alert" style={{ margin: 0 }}>{st.lastError}</p>}
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={st.autoSync} onChange={(e) => toggle({ autoSync: e.target.checked })} />
                <span>Sincronizar sozinho de tempos em tempos (a cada 30 minutos, com o app aberto)</span>
              </label>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={st.logSessions} onChange={(e) => toggle({ logSessions: e.target.checked })} />
                <span>Registrar no Google Agenda as sessões de foco que eu concluir</span>
              </label>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-primary" onClick={syncNow} disabled={busy}>{busy ? 'Aguarde…' : 'Sincronizar agora'}</button>
                <button className="btn" onClick={disconnect} disabled={busy}>Desconectar</button>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Os eventos do app ficam num calendário separado chamado <strong>Learning Center · Estudos</strong>. Seus outros eventos nunca são alterados.
              </p>
            </div>
          )}
        </section>
      )}

      {st && <PlanSection connected={st.connected} courses={courses.data} onChanged={() => status.reload()} />}
    </>
  );
}
