import { useEffect, useState } from 'react';
import { isDesktop } from './DesktopUdemy.jsx';

const HIDE_MS = 24 * 60 * 60 * 1000;
const KEY = 'lume-update-hidden';

/** "Depois" esconde o aviso daquela versão por 24 h (guardado no navegador do app; versão mais nova volta a avisar). */
function hiddenFor(version) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Boolean(saved && saved.version === version && Date.now() < saved.until);
  } catch {
    return false;
  }
}
function hide(version) {
  try { localStorage.setItem(KEY, JSON.stringify({ version, until: Date.now() + HIDE_MS })); } catch { /* sem armazenamento: só some até recarregar */ }
}

/**
 * Aviso de versão nova no início (só no app instalado): "Lume X.Y.Z disponível".
 * No Windows o botão baixa e instala; no Mac abre a página de download. Se não há versão nova, ou a internet falha, não aparece.
 */
export function UpdateCard() {
  const [info, setInfo] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | starting | started | error
  const [dismissed, setDismissed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    if (!isDesktop() || typeof window.lcDesktop.updateState !== 'function') return undefined;
    let alive = true;
    Promise.resolve(window.lcDesktop.updateState(true))
      .then((state) => { if (alive && state && state.status === 'available') setInfo(state); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!info || dismissed || hiddenFor(info.version)) return null;

  async function install() {
    setPhase('starting');
    try {
      const res = await window.lcDesktop.installUpdate();
      setPhase(res && res.status === 'started' ? 'started' : 'error');
    } catch {
      setPhase('error');
    }
  }

  const mac = info.platform === 'darwin';
  const safePage = typeof info.pageUrl === 'string' && info.pageUrl.startsWith('https://github.com/ysauron2/learning-center/');
  return (
    <section className="card update-card" aria-label="Nova versão do Lume" role="region">
      <div className="update-card-main">
        <div style={{ minWidth: 0 }}>
          <div className="update-card-title">🚀 Lume {info.version} disponível</div>
          <div className="muted" style={{ fontSize: 13 }}>Você está na versão {info.current}.</div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={install} disabled={phase === 'starting' || phase === 'started'}>
            {phase === 'starting' ? 'Aguarde…' : phase === 'started' ? 'Atualizando…' : 'Atualizar agora'}
          </button>
          {phase === 'idle' && (
            <button className="btn" onClick={() => { hide(info.version); setDismissed(true); }}>Depois</button>
          )}
        </div>
      </div>
      {phase === 'started' && (
        <p role="status" aria-live="polite" className="muted" style={{ margin: '10px 0 0' }}>
          {mac
            ? 'Abrimos a página de download no navegador: baixe o arquivo do seu Mac e arraste para Aplicativos.'
            : 'Baixando a nova versão. Quando terminar, o Lume pergunta se pode reiniciar para instalar (seus dados são mantidos).'}
        </p>
      )}
      {phase === 'error' && (
        <p role="alert" className="alert error" style={{ margin: '10px 0 0' }}>
          Não consegui iniciar a atualização agora. Tente de novo{safePage ? <> ou baixe pela <a href={info.pageUrl} target="_blank" rel="noopener noreferrer">página de download</a></> : null}.
        </p>
      )}
      {info.notes && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost btn-sm" style={{ padding: 0, minHeight: 28 }} onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes}>
            {showNotes ? 'Esconder novidades' : 'Ver novidades'}
          </button>
          {showNotes && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-line', fontSize: 14 }}>{info.notes}</p>}
        </div>
      )}
    </section>
  );
}
