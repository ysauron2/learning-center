import { lazy, Suspense } from 'react';
import { Route, Routes, Link } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { Skeleton } from './components/ui.jsx';

import Dashboard from './pages/Dashboard.jsx';
import Courses from './pages/Courses.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
const ImportUdemy = lazy(() => import('./pages/ImportUdemy.jsx'));
const ImportContent = lazy(() => import('./pages/ImportContent.jsx'));
const Notes = lazy(() => import('./pages/Notes.jsx'));
const Tracks = lazy(() => import('./pages/Tracks.jsx'));
const TrackDetail = lazy(() => import('./pages/TrackDetail.jsx'));
const Agenda = lazy(() => import('./pages/Agenda.jsx'));
const Backup = lazy(() => import('./pages/Backup.jsx'));
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
const Focus = lazy(() => import('./pages/Focus.jsx'));

function NotFound() {
  return (
    <div className="card" role="alert">
      <h1 className="page-title" style={{ fontSize: 24 }}>Página não encontrada</h1>
      <p className="page-sub">Esse endereço não existe.</p>
      <Link className="btn btn-primary" to="/" style={{ marginTop: 14 }}>Ir para o início</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="cursos" element={<Courses />} />
        <Route path="cursos/:id" element={<CourseDetail />} />
        <Route path="importar" element={<Suspense fallback={<Skeleton height={340} />}><ImportUdemy /></Suspense>} />
        <Route path="importar-conteudo" element={<Suspense fallback={<Skeleton height={340} />}><ImportContent /></Suspense>} />
        <Route path="anotacoes/:id?" element={<Suspense fallback={<Skeleton height={340} />}><Notes /></Suspense>} />
        <Route path="trilhas" element={<Suspense fallback={<Skeleton height={340} />}><Tracks /></Suspense>} />
        <Route path="trilhas/:id" element={<Suspense fallback={<Skeleton height={340} />}><TrackDetail /></Suspense>} />
        <Route path="agenda" element={<Suspense fallback={<Skeleton height={340} />}><Agenda /></Suspense>} />
        <Route path="backup" element={<Suspense fallback={<Skeleton height={340} />}><Backup /></Suspense>} />
        <Route path="analytics" element={<Suspense fallback={<Skeleton height={340} />}><Analytics /></Suspense>} />
        <Route path="foco" element={<Suspense fallback={<Skeleton height={340} />}><Focus /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
