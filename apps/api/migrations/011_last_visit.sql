-- Última vez que a pessoa abriu o curso no site da plataforma (detecção automática do Lume).
-- Coluna aditiva: cursos antigos ficam com NULL.
ALTER TABLE lc_courses ADD COLUMN last_visited_at TEXT;
