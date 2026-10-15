/**
 * Sincroniza as agendas externas (Google Agenda e/ou Notion) de tempos em tempos, sozinho — só as que estiverem
 * conectadas e com a opção ligada. Falhas nunca derrubam o app (nem impedem a outra agenda): ficam registradas
 * em `last_error`, que a tela mostra.
 */
export function createAutoSync({ calendar, notion, intervalMs = 30 * 60 * 1000, firstDelayMs = 20 * 1000, setTimer = setInterval, clearTimer = clearInterval, setOnce = setTimeout, clearOnce = clearTimeout }) {
  const targets = [calendar, notion].filter(Boolean);
  let timer = null;
  let first = null;
  let running = false;

  /** Devolve true se pelo menos uma agenda sincronizou. */
  async function tick() {
    if (running) return false;
    running = true;
    let any = false;
    try {
      for (const target of targets) {
        try {
          const st = target.status();
          if (!st.connected || !st.autoSync) continue;
          await target.syncNow();
          any = true;
        } catch {
          // o motivo já foi guardado no estado da conexão
        }
      }
      return any;
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setTimer(tick, intervalMs);
    timer.unref?.();
    first = setOnce(tick, firstDelayMs);
    first.unref?.();
  }

  function stop() {
    if (timer) clearTimer(timer);
    if (first) clearOnce(first);
    timer = null;
    first = null;
  }

  return { start, stop, tick };
}
