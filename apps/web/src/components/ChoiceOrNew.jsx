import { useMemo, useState } from 'react';

const NEW = '__new__';

/** Junta listas de opções sem repetir (ignora maiúsculas e espaços nas pontas) e descarta vazios. */
export function mergeOptions(...lists) {
  const seen = new Set();
  const out = [];
  for (const item of lists.flat()) {
    const v = typeof item === 'string' ? item.trim() : '';
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

/**
 * Lista para escolher entre o que já existe ou criar uma opção nova ("Outra…").
 * O valor sai sempre como texto em `onChange`.
 */
export function ChoiceOrNew({ id, label, value, options, onChange, newLabel = 'Outra…', placeholder = 'Digite o nome' }) {
  const [adding, setAdding] = useState(false);
  const all = useMemo(() => mergeOptions(options, [value]), [options, value]);

  return (
    <div className="field" style={{ flex: '1 1 200px' }}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="select"
        value={adding ? NEW : value}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setAdding(true);
            onChange('');
          } else {
            setAdding(false);
            onChange(e.target.value);
          }
        }}
      >
        {all.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={NEW}>➕ {newLabel}</option>
      </select>
      {adding && (
        <input
          className="input"
          aria-label={`${label} (nova)`}
          value={value}
          maxLength={60}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      )}
    </div>
  );
}
