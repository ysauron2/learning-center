const pad = (n) => String(n).padStart(2, '0');

/** learning-center-backup-2026-03-05-0907.json (horário local) */
export function backupFileName(date = new Date(), prefix = 'learning-center-backup') {
  const d = date;
  return `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

/** Lê o texto de um arquivo escolhido pelo usuário e confere o básico antes de mandar ao servidor. */
export function parseBackupText(text) {
  if (!text || !text.trim()) return { ok: false, error: 'O arquivo está vazio.' };
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    return { ok: false, error: 'O arquivo não é um JSON válido.' };
  }
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) return { ok: false, error: 'O arquivo não parece um backup.' };
  if (backup.app !== 'learning-center') return { ok: false, error: 'Esse arquivo não é um backup do Learning Center.' };
  return { ok: true, backup };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function countsText(c) {
  const parts = [plural(c.courses, 'curso', 'cursos'), plural(c.modules, 'módulo', 'módulos'), plural(c.lessons, 'aula', 'aulas'), plural(c.sessions, 'sessão', 'sessões')];
  // anotações e trilhas só aparecem quando a contagem veio do servidor (backups antigos não têm)
  if (c.notes !== undefined) parts.push(plural(c.notes, 'anotação', 'anotações'));
  if (c.tracks !== undefined) parts.push(plural(c.tracks, 'trilha', 'trilhas'));
  return parts.join(' · ');
}

/** Baixa `data` como arquivo .json pelo navegador. */
export function saveJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
