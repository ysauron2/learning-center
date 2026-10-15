import { NavLink } from 'react-router-dom';
import { IMPORT_PLATFORMS, PLATFORM_ORDER } from '../lib/platforms.js';

/** Escolha da fonte de importação: Udemy, Alura, Fundação Bradesco, link de um curso ou outras fontes. */
export function ImportTabs() {
  const links = [
    ...PLATFORM_ORDER.map((id) => ({ to: IMPORT_PLATFORMS[id].path, label: IMPORT_PLATFORMS[id].name, end: true })),
    { to: '/importar/link', label: 'Colar link de um curso', end: true },
    { to: '/importar-outras', label: 'Outras fontes', end: true },
  ];
  return (
    <nav className="row" aria-label="De onde importar" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
      {links.map((l) => (
        <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `chip${isActive ? ' active' : ''}`} aria-current={undefined}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
