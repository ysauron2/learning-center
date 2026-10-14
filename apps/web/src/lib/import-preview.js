/** A importação tem o que fazer se houver curso novo ou capa a preencher. */
export const hasWork = (preview) => preview.new.length > 0 || (preview.imagesToFill ?? 0) > 0;

/** Texto do botão de confirmar, conforme o que realmente será feito. */
export function confirmLabel(preview) {
  const novos = preview.new.length;
  const capas = preview.imagesToFill ?? 0;
  if (novos && capas) return `Importar ${novos} curso(s) e preencher ${capas} capa(s)`;
  if (novos) return `Importar ${novos} curso(s)`;
  if (capas) return `Preencher ${capas} capa(s)`;
  return 'Nada a importar';
}
