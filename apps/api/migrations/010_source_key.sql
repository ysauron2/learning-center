-- Chave estável do curso de uma plataforma importada por link ou pela leitura de "Meus cursos"
-- (ex.: "alura:javascript-algoritmos" ou "bradesco:atendimento-ao-publico").
-- Serve para não duplicar o curso ao importar de novo. A coluna é aditiva: cursos antigos ficam com NULL.
ALTER TABLE lc_courses ADD COLUMN source_key TEXT;
CREATE UNIQUE INDEX idx_lc_courses_source_key ON lc_courses(source_key) WHERE source_key IS NOT NULL;
