import { NavLink, Outlet } from 'react-router-dom';
import { Icon } from './Icon.jsx';
import { useTheme } from '../lib/hooks.js';

const ACTIVE = [
  { to: '/', label: 'Learning Center', icon: 'book', end: true },
  { to: '/cursos', label: 'Cursos', icon: 'courses' },
  { to: '/foco', label: 'Sessões de foco', icon: 'timer' },
  { to: '/analytics', label: 'Analytics', icon: 'chart' },
];
const SOON = [
  { label: 'Trilhas', icon: 'route' },
  { label: 'Certificações', icon: 'award' },
  { label: 'Anotações', icon: 'note' },
  { label: 'Laboratórios', icon: 'flask' },
  { label: 'Tutor IA', icon: 'sparkle' },
];

export function Layout() {
  const [theme, toggleTheme] = useTheme();
  const themeLabel = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Navegação principal">
        <div className="brand">
          <span className="brand-mark"><Icon name="cube" size={18} strokeWidth={2} /></span>
          MEU HUB
        </div>
        {ACTIVE.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Icon name={i.icon} />{i.label}
          </NavLink>
        ))}
        {SOON.map((i) => (
          <span key={i.label} className="nav-link" aria-disabled="true">
            <Icon name={i.icon} />{i.label}<span className="nav-soon">EM BREVE</span>
          </span>
        ))}
        <div className="sidebar-spacer" />
        <button className="nav-link" onClick={toggleTheme} aria-label={themeLabel}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        </button>
      </nav>

      <div className="main-wrap" style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
        <main className="main" style={{ width: '100%' }}>
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navegação">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="home" size={22} />Início</NavLink>
        <NavLink to="/cursos" className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="courses" size={22} />Cursos</NavLink>
        <NavLink to="/foco" className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="timer" size={22} />Foco</NavLink>
        <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="chart" size={22} />Analytics</NavLink>
        <button onClick={toggleTheme} aria-label={themeLabel}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={22} />Tema</button>
      </nav>
    </div>
  );
}
