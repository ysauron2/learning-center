import { useState } from 'react';
import { api } from '../lib/api.js';
import { Modal } from './ui.jsx';

/** Criar ou editar o nome e a descrição de uma trilha. */
export function TrackForm({ track, onClose, onSaved }) {
  const editing = Boolean(track);
  const [title, setTitle] = useState(track?.title ?? '');
  const [description, setDescription] = useState(track?.description ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { title, description };
      const saved = editing ? await api.updateTrack(track.id, payload) : await api.createTrack(payload);
      onSaved(saved);
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  const titleError = error?.details?.find((d) => d.path === 'title')?.message;

  return (
    <Modal title={editing ? 'Editar trilha' : 'Nova trilha'} onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 16 }}>
        <div className="field">
          <label htmlFor="tf-title">Nome da trilha</label>
          <input id="tf-title" className="input" value={title} maxLength={120} required placeholder="Ex.: Cibersegurança do zero ao Security+"
            aria-invalid={Boolean(titleError)} onChange={(e) => setTitle(e.target.value)} />
          {titleError && <span className="error-text">{titleError}</span>}
        </div>
        <div className="field">
          <label htmlFor="tf-desc">Descrição (opcional)</label>
          <textarea id="tf-desc" className="textarea" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)}
            placeholder="Para que serve esta trilha, o que você quer alcançar…" />
        </div>
        {error && !titleError && <p className="alert error" role="alert">{error.message}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
