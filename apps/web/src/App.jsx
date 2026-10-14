import { lazy, Suspense } from 'react';
import { Route, Routes, Link } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { Skeleton } from './components/ui.jsx';

import Dashboard from './pages/Dashboard.jsx';
import Courses from './pages/Courses.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
const ImportUdemy = lazy(() => import('./pages/ImportUdemy.jsx'));
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
        <Route path="foco" element={<Suspense fallback={<Skeleton height={340} />}><Focus /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
