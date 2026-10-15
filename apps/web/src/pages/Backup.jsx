import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { backupFileName, countsText, parseBackupText, saveJsonFile } from '../lib/backup.js';
import { ErrorState } from '../components/ui.jsx';

export default function Backup() {
  const [file, setFile] = useState(null); // { name, backup, summary }
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      saveJsonFile(backupFileName(), await api.backup());
      setMsg('Backup baixado. Guarde o arquivo em um lugar seguro (nuvem ou pendrive).');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function choose(e) {
    const picked = e.target.files?.[0];
    e.target.value = '';
    setError(null);
    setMsg(null);
    setAgree(false);
    setFile(null);
    if (!picked) return;
    const parsed = parseBackupText(await picked.text());
    if (!parsed.ok) {
      setError(new Error(parsed.error));
      return;
    }
    try {
      const summary = await api.backupPreview(parsed.backup);
      setFile({ name: picked.name, backup: parsed.backup, summary });
    } catch (err) {
      setError(err);
    }
  }

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      // Rede de segurança: baixa o que existe agora antes de substituir.
      saveJsonFile(backupFileName(new Date(), 'learning-center-antes-de-restaurar'), await api.backup());
      const done = await api.backupRestore(file.backup);
      setMsg(`Restaurado: ${countsText(done.counts)}. Os dados anteriores foram baixados num arquivo, por segurança.`);
      setFile(null);
      setAgree(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Backup dos dados</h1>
          <p className="page-sub">Cursos, aulas, sessões de estudo e metas num único arquivo.</p>
        </div>
        <Link className="btn" to="/cursos">Voltar</Link>
      </header>

      {error && <ErrorState error={error} />}
      {msg && <p className="card" role="status" aria-live="polite" style={{ marginBottom: 16 }}>{msg}</p>}

      <div className="an-grid">
        <section className="card" aria-label="Baixar backup">
          <h2 className="card-title">Baixar backup</h2>
          <p className="page-sub">Faça isso de vez em quando. O arquivo tem todos os seus dados e não tem senha, então guarde com cuidado.</p>
          <button className="btn btn-primary" onClick={download} disabled={busy} style={{ marginTop: 12 }}>
            {busy && !file ? 'Gerando…' : 'Baixar backup'}
          </button>
        </section>

        <section className="card" aria-label="Restaurar backup">
          <h2 className="card-title">Restaurar de um backup</h2>
          <p className="page-sub">Use para recuperar os dados ou levar para outro computador.</p>
          <label htmlFor="bk-file" className="btn" style={{ marginTop: 12, cursor: 'pointer' }}>Escolher arquivo…</label>
          <input id="bk-file" type="file" accept=".json,application/json" onChange={choose} className="sr-only" />

          {file && (
            <div style={{ marginTop: 16 }} aria-label="Prévia da restauração">
              <p style={{ margin: 0 }}><strong>{file.name}</strong></p>
              <p className="muted" style={{ margin: '4px 0' }}>
                Salvo em {new Date(file.summary.exportedAt).toLocaleString('pt-BR')}: {countsText(file.summary.counts)}
              </p>
              <p role="alert" style={{ margin: '10px 0', color: 'var(--danger)' }}>
                Atenção: isto <strong>substitui todos os dados atuais</strong> pelos do arquivo.
              </p>
              <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>Entendo que os dados atuais serão substituídos (vou baixar uma cópia deles antes).</span>
              </label>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" disabled={!agree || busy} onClick={restore}>
                  {busy ? 'Restaurando…' : 'Restaurar e substituir tudo'}
                </button>
                <button className="btn" disabled={busy} onClick={() => { setFile(null); setAgree(false); }}>Cancelar</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
