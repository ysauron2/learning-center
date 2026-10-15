import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { ErrorState, Modal, Skeleton } from './ui.jsx';

const KINDS = {
  categories: { tab: 'Categorias', one: 'categoria', Cap: 'Categoria', fallback: 'Geral', addLabel: 'Adicionar categoria', placeholder: 'Ex.: Design' },
  platforms: { tab: 'Plataformas', one: 'plataforma', Cap: 'Plataforma', fallback: 'Outro', addLabel: 'Adicionar plataforma', placeholder: 'Ex.: Domestika' },
};
const cursos = (n) => (n === 0 ? 'nenhum curso' : `${n} ${n === 1 ? 'curso' : 'cursos'}`);

/** Criar, renomear e excluir categorias e plataformas. Excluir move os cursos para a opção padrão. */
export function ManageOptions({ onClose, onChanged }) {
  const [kind, setKind] = useState('categories');
  const [renaming, setRenaming] = useState(null); // { name, value }
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const data = useAsync(() => api.options(), []);
  const def = KINDS[kind];
  const list = data.data?.[kind] ?? [];

  async function run(fn, okText) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      setMessage(okText(result));
      onChanged?.();
      await data.refetch();
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function remove(o) {
    const text = o.count > 0
      ? `Excluir a ${def.one} "${o.name}"? Os ${cursos(o.count)} dela passam para "${def.fallback}".`
      : `Excluir a ${def.one} "${o.name}"?`;
    if (!window.confirm(text)) return;
    run(() => api.deleteOption(kind, o.name), (r) =>
      `${def.Cap} "${o.name}" excluída.${r.moved > 0 ? ` ${cursos(r.moved)} ${r.moved === 1 ? 'foi' : 'foram'} para "${r.movedTo}".` : ''}`);
  }

  async function saveRename(o) {
    const ok = await run(() => api.renameOption(kind, o.name, renaming.value), (r) =>
      r.merged ? `${def.Cap} "${o.name}" foi juntada com "${r.name}".` : `${def.Cap} renomeada para "${r.name}".`);
    if (ok) setRenaming(null);
  }

  async function add(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const ok = await run(() => api.createOption(kind, newName), (r) =>
      r.created ? `${def.Cap} "${r.name}" adicionada.` : `A ${def.one} "${r.name}" já existe.`);
    if (ok) setNewName('');
  }

  return (
    <Modal title="Categorias e plataformas" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <p className="muted" style={{ margin: 0 }}>
          Ao excluir, os cursos não são apagados: eles passam para a opção padrão.
        </p>
        <div className="row" role="group" aria-label="Tipo" style={{ gap: 8 }}>
          {Object.entries(KINDS).map(([k, d]) => (
            <button key={k} className="chip" aria-pressed={kind === k} onClick={() => { setKind(k); setRenaming(null); setMessage(null); setError(null); }}>{d.tab}</button>
          ))}
        </div>

        {message && <p role="status" aria-live="polite" className="alert" style={{ margin: 0 }}>{message}</p>}
        {error && <p role="alert" className="alert error" style={{ margin: 0 }}>{error.message}</p>}

        {data.loading && !data.data && <Skeleton height={160} />}
        {data.error && <ErrorState error={data.error} onRetry={data.refetch} />}

        {data.data && (
          <ul className="opt-list">
            {list.map((o) => (
              <li key={o.name} className="opt-row">
                {renaming?.name === o.name ? (
                  <>
                    <input className="input" aria-label={`Novo nome de ${o.name}`} value={renaming.value} maxLength={60}
                      onChange={(e) => setRenaming({ name: o.name, value: e.target.value })} />
                    <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => saveRename(o)}>Salvar</button>
                    <button className="btn btn-sm" onClick={() => setRenaming(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong className="opt-name">{o.name}</strong>
                      {o.protected && <span className="badge" style={{ marginLeft: 8 }}>padrão</span>}
                      <span className="muted" style={{ display: 'block', fontSize: 12 }}>{cursos(o.count)}</span>
                    </span>
                    <button className="btn btn-sm" disabled={busy || o.protected} onClick={() => setRenaming({ name: o.name, value: o.name })}>Renomear</button>
                    <button className="btn btn-sm btn-danger" disabled={busy || o.protected} onClick={() => remove(o)}>Excluir</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form className="row" onSubmit={add} aria-label={def.addLabel} style={{ gap: 8 }}>
          <label className="sr-only" htmlFor="opt-new">{def.addLabel}</label>
          <input id="opt-new" className="input" style={{ flex: 1 }} value={newName} maxLength={60} placeholder={def.placeholder}
            onChange={(e) => setNewName(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>Adicionar</button>
        </form>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  );
}
