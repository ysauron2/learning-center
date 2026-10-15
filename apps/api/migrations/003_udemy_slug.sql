-- Endereço (slug) do curso no player da Udemy, aprendido na importação de conteúdo.
-- Permite reconhecer o curso nas próximas sincronizações mesmo que o título mude.
ALTER TABLE lc_courses ADD COLUMN udemy_slug TEXT;
CREATE UNIQUE INDEX idx_lc_courses_udemy_slug ON lc_courses(udemy_slug) WHERE udemy_slug IS NOT NULL;
