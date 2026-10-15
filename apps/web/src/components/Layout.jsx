import { NavLink, Outlet } from 'react-router-dom';
import { Icon } from './Icon.jsx';
import { useTheme } from '../lib/hooks.js';
import { isDesktop, openUdemy } from './DesktopUdemy.jsx';

const ACTIVE = [
  { to: '/', label: 'Learning Center', icon: 'book', end: true },
  { to: '/cursos', label: 'Cursos', icon: 'courses' },
  { to: '/trilhas', label: 'Trilhas', icon: 'route' },
  { to: '/foco', label: 'Sessões de foco', icon: 'timer' },
  { to: '/anotacoes', label: 'Anotações', icon: 'note' },
  { to: '/analytics', label: 'Analytics', icon: 'chart' },
  { to: '/agenda', label: 'Agenda', icon: 'clock' },
  { to: '/backup', label: 'Backup', icon: 'cube' },
];
const SOON = [
  { label: 'Certificações', icon: 'award' },
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
        {isDesktop() && (
          <button className="nav-link" onClick={openUdemy}><Icon name="play" />Abrir a Udemy</button>
        )}
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
        <NavLink to="/trilhas" className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="route" size={22} />Trilhas</NavLink>
        <NavLink to="/foco" className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="timer" size={22} />Foco</NavLink>
        <NavLink to="/anotacoes" className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="note" size={22} />Notas</NavLink>
        <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="chart" size={22} />Analytics</NavLink>
        <NavLink to="/agenda" className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="clock" size={22} />Agenda</NavLink>
        <button onClick={toggleTheme} aria-label={themeLabel}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={22} />Tema</button>
      </nav>
    </div>
  );
}
