import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { relativeSync } from '../lib/calendar.js';
import { syncSummaryText } from './AgendaCard.jsx';
import { Skeleton } from './ui.jsx';

function TokenForm({ onSaved, replacing }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.notionToken(token.trim());
      setToken('');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Código do Notion" style={{ display: 'grid', gap: 12 }}>
      <div className="field">
        <label htmlFor="nt-token">{replacing ? 'Novo código da integração' : 'Código da integração'}</label>
        <input id="nt-token" className="input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ntn_…" autoComplete="off" />
      </div>
      {error && <p className="alert error" role="alert" style={{ margin: 0 }}>{error.message}</p>}
      <div><button className="btn btn-primary" type="submit" disabled={busy || !token.trim()}>{busy ? 'Conferindo…' : 'Salvar código'}</button></div>
    </form>
  );
}

function PagePicker({ status, onConnected, onChangeToken }) {
  const pages = useAsync(() => api.notionPages(), []);
  const [pageId, setPageId] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = pages.data ?? [];
  const chosen = pageId || list[0]?.id || '';

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api.notionConnect(chosen);
      onConnected();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0 }}>✅ Código aceito{status.workspace ? <> (espaço <strong>{status.workspace}</strong>)</> : null}. Agora escolha onde a tabela de estudos vai ficar:</p>
      {pages.loading && !pages.data && <Skeleton height={44} />}
      {pages.error && <p className="alert error" role="alert" style={{ margin: 0 }}>{pages.error.message}</p>}
      {pages.data && list.length === 0 && (
        <p className="alert" role="status" style={{ margin: 0 }}>
          O Notion ainda não mostrou nenhuma página para este app. Faça o <strong>passo 2</strong> (abrir uma página → “…” → <strong>Conexões</strong> → adicionar a integração) e clique em <strong>Atualizar lista</strong>.
        </p>
      )}
      {list.length > 0 && (
        <div className="field">
          <label htmlFor="nt-page">Página</label>
          <select id="nt-page" className="select" value={chosen} onChange={(e) => setPageId(e.target.value)}>
            {list.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      )}
      {error && <p className="alert error" role="alert" style={{ margin: 0 }}>{error.message}</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" onClick={create} disabled={busy || !chosen}>{busy ? 'Criando…' : 'Criar tabela de estudos'}</button>
        <button className="btn" onClick={pages.reload} disabled={busy}>Atualizar lista</button>
        <button className="btn" onClick={onChangeToken} disabled={busy}>Trocar o código</button>
      </div>
    </div>
  );
}

/**
 * Notion: um único código (sem Google, sem Cloud). O app cria a tabela "Learning Center · Estudos" e a mantém atualizada;
 * o Notion Calendar mostra essa tabela junto com Google e iCloud.
 */
export function NotionCalendar({ onChanged = () => {}, onMessage = () => {} }) {
  const status = useAsync(() => api.notionStatus(), []);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const st = status.data;

  const refresh = () => { status.reload(); onChanged(); };

  async function run(fn, done) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (done) onMessage(done(result));
      refresh();
    } catch (err) {
      setError(err);
      status.reload();
    } finally {
      setBusy(false);
    }
  }

  const syncNow = () => run(() => api.notionSync(), (r) => `Notion · ${syncSummaryText(r)}`);
  const disconnect = () => {
    if (!window.confirm('Desconectar o Notion? A tabela e o que já está nela continuam lá; o app só para de sincronizar.')) return;
    return run(() => api.notionDisconnect(), () => 'Notion desconectado.');
  };
  const toggle = (patch) => run(() => api.notionSettings(patch));

  return (
    <section className="card" aria-label="Notion">
      <h2 className="card-title">Notion e Notion Calendar · fácil, com um código só</h2>
      <p className="muted" style={{ margin: '6px 0 12px' }}>
        O app cria no seu Notion uma tabela “Learning Center · Estudos” com seus horários de estudo e as sessões que você concluir. O <strong>Notion Calendar</strong> mostra essa tabela ao lado do seu Google Agenda e do iCloud.
      </p>

      {status.loading && !st && <Skeleton height={120} />}
      {status.error && <p className="alert error" role="alert">{status.error.message}</p>}

      {st && !st.hasToken && (
        <>
          <ol className="agenda-steps">
            <li>Abra <a href="https://www.notion.so/profile/integrations" target="_blank" rel="noopener noreferrer">notion.so/profile/integrations</a>, clique em <strong>Nova integração</strong>, dê o nome <em>Learning Center</em>, escolha o seu espaço e salve. Depois clique em <strong>Mostrar</strong> no “Segredo da integração” e <strong>copie</strong> o código.</li>
            <li>No Notion, abra (ou crie) uma página, por exemplo <em>Estudos</em>. Clique em <strong>“…”</strong> no canto de cima → <strong>Conexões</strong> → adicione <em>Learning Center</em>.</li>
            <li>Cole o código aqui embaixo e clique em <strong>Salvar código</strong>.</li>
          </ol>
          <TokenForm onSaved={refresh} />
        </>
      )}

      {st && st.hasToken && !st.connected && !replacing && (
        <>
          {st.lastError && <p className="alert error" role="alert" style={{ margin: '0 0 12px' }}>{st.lastError}</p>}
          <PagePicker status={st} onConnected={refresh} onChangeToken={() => setReplacing(true)} />
        </>
      )}

      {st && st.hasToken && !st.connected && replacing && (
        <>
          <TokenForm replacing onSaved={() => { setReplacing(false); refresh(); }} />
          <button className="btn" style={{ marginTop: 8 }} onClick={() => setReplacing(false)}>Cancelar</button>
        </>
      )}

      {st && st.connected && (
        <div style={{ display: 'grid', gap: 14 }}>
          <p style={{ margin: 0 }}>
            ✅ Conectado{st.workspace ? <> ao espaço <strong>{st.workspace}</strong></> : null}. Última sincronização: {relativeSync(st.lastSyncAt)}.
            {st.databaseUrl && <> <a href={st.databaseUrl} target="_blank" rel="noopener noreferrer">Abrir a tabela no Notion</a></>}
          </p>
          {st.lastError && <p className="alert error" role="alert" style={{ margin: 0 }}>{st.lastError}</p>}
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={st.autoSync} onChange={(e) => toggle({ autoSync: e.target.checked })} />
            <span>Sincronizar sozinho de tempos em tempos (a cada 30 minutos, com o app aberto)</span>
          </label>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={st.logSessions} onChange={(e) => toggle({ logSessions: e.target.checked })} />
            <span>Registrar no Notion as sessões de foco que eu concluir</span>
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={syncNow} disabled={busy}>{busy ? 'Aguarde…' : 'Sincronizar agora'}</button>
            <button className="btn" onClick={disconnect} disabled={busy}>Desconectar</button>
          </div>
          <details>
            <summary>Como ver isso no Notion Calendar</summary>
            <p style={{ margin: '8px 0' }}>
              No Notion Calendar, abra as <strong>Configurações</strong>, entre na sua conta do Notion e adicione a tabela <strong>Learning Center · Estudos</strong> (a data usada é a coluna <em>Quando</em>). Ela passa a aparecer no calendário, junto com o resto. Os nomes dos menus podem mudar um pouco com o tempo.
            </p>
          </details>
        </div>
      )}

      {error && <p role="alert" className="alert error" style={{ margin: '12px 0 0' }}>{error.message}</p>}
    </section>
  );
}
