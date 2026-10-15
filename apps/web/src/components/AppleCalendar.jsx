import { useState } from 'react';

const feedPath = '/api/v1/calendar/feed.ics';

/** Endereços do calendário assinável a partir do endereço em que o app está aberto. */
export function feedUrls(origin) {
  const u = new URL(origin);
  return {
    http: `${u.origin}${feedPath}`,
    webcal: `webcal://${u.host}${feedPath}`, // abre direto no Calendário (Mac/iPhone)
    download: `${u.origin}${feedPath}?download=1`,
  };
}

/** Copia texto; devolve true/false (alguns navegadores bloqueiam fora de HTTPS). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label = 'Copiar', done = 'Copiado!' }) {
  const [state, setState] = useState(null); // null | 'ok' | 'fail'
  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => { setState((await copyText(text)) ? 'ok' : 'fail'); setTimeout(() => setState(null), 2500); }}
      >
        {state === 'ok' ? done : label}
      </button>
      {state === 'fail' && <span className="muted" role="status" style={{ fontSize: 12 }}>Não deu para copiar: selecione o texto e copie.</span>}
    </>
  );
}

/**
 * O jeito mais fácil: o Calendário da Apple (Mac e iPhone) "assina" o endereço e se atualiza sozinho.
 * Não precisa de conta, chave nem senha.
 */
export function AppleCalendar() {
  const urls = feedUrls(window.location.origin);
  return (
    <section className="card" aria-label="Calendário da Apple">
      <h2 className="card-title">Calendário da Apple (Mac e iPhone) · o jeito mais fácil</h2>
      <p className="muted" style={{ margin: '6px 0 12px' }}>
        Sem conta, sem chave, sem senha. Seu plano de estudo e as sessões de foco aparecem no Calendário e se atualizam sozinhos.
      </p>
      <ol className="agenda-steps">
        <li>Clique em <strong>Abrir no Calendário</strong>. No Mac, o Calendário abre e pergunta se você quer assinar: confirme.</li>
        <li>Em <strong>Atualização automática</strong>, escolha <strong>A cada 15 minutos</strong> e clique em <strong>OK</strong>.</li>
        <li>Pronto: monte o plano de estudo mais abaixo, e os horários aparecem lá.</li>
      </ol>
      <div className="row" style={{ gap: 8 }}>
        <a className="btn btn-primary" href={urls.webcal}>Abrir no Calendário</a>
        <a className="btn" href={urls.download} download>Baixar arquivo (.ics)</a>
      </div>
      <details style={{ marginTop: 12 }}>
        <summary>O botão não abriu o Calendário? Faça assim</summary>
        <p style={{ margin: '8px 0' }}>
          No Calendário, vá em <strong>Arquivo → Nova assinatura de calendário…</strong> e cole este endereço:
        </p>
        <div className="row" style={{ gap: 8 }}>
          <code className="agenda-url">{urls.http}</code>
          <CopyButton text={urls.http} />
        </div>
      </details>
      <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
        Atualiza enquanto o Lume estiver aberto neste computador. O Google Agenda <strong>não</strong> consegue assinar este endereço (ele não alcança o seu computador); para ele, use a conexão abaixo.
      </p>
    </section>
  );
}
