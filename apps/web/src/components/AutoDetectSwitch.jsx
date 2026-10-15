import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export const AUTO_DETECT_OPTIONS = [
  { mode: 'ask', label: 'Perguntar', hint: 'Mostra um aviso na página e você escolhe.' },
  { mode: 'auto', label: 'Automático', hint: 'Adiciona sozinho, com um aviso curto e o botão Desfazer.' },
  { mode: 'never', label: 'Nunca', hint: 'Não faz nada quando você abre um curso.' },
];

/** "Marcar cursos automaticamente": o que o Lume faz quando você abre um curso no site de uma plataforma. */
export function AutoDetectSwitch() {
  const [mode, setMode] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.autoDetect();
        if (alive && s?.mode) setMode(s.mode);
      } catch {
        /* sem o servidor ou sem a rota: o interruptor simplesmente não aparece */
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!mode) return null;

  const choose = async (next) => {
    const before = mode;
    setMode(next);
    setError(null);
    try {
      const s = await api.setAutoDetect(next);
      setMode(s.mode);
    } catch {
      setMode(before);
      setError('Não consegui salvar essa escolha. Tente de novo.');
    }
  };

  return (
    <section className="card" aria-labelledby="auto-detect-title" style={{ marginTop: 18 }}>
      <h2 className="card-title" id="auto-detect-title">Marcar cursos automaticamente</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Quando você abre um curso no site da Alura, da Microsoft Learn e de outras plataformas (com o app do Lume ou a extensão do navegador),
        o Lume pode marcá-lo como “em andamento”. Ele só envia o título da página e, se aparecer na tela, a porcentagem de progresso.
      </p>
      <div role="radiogroup" aria-label="Marcar cursos automaticamente" className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {AUTO_DETECT_OPTIONS.map((o) => (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={mode === o.mode}
            className={`chip${mode === o.mode ? ' active' : ''}`}
            title={o.hint}
            onClick={() => choose(o.mode)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginBottom: 0 }} aria-live="polite">
        {AUTO_DETECT_OPTIONS.find((o) => o.mode === mode)?.hint}
      </p>
      {error && <p className="alert error" role="alert">{error}</p>}
    </section>
  );
}
