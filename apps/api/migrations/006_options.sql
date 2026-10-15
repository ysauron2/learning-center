-- Lista de categorias e plataformas que a pessoa pode escolher, criar, renomear e apagar.
-- Antes eram só textos soltos nos cursos; agora as sugestões padrão vivem aqui e podem ser removidas.
-- Apagar uma opção move os cursos dela para a padrão ("Geral" / "Outro"), que não pode ser apagada.
CREATE TABLE lc_options (
  kind TEXT NOT NULL CHECK (kind IN ('category', 'platform')),
  name TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (kind, name)
);

INSERT INTO lc_options (kind, name) VALUES
  ('category', 'Cibersegurança'), ('category', 'Redes'), ('category', 'Linux'),
  ('category', 'Desenvolvimento'), ('category', 'Certificação'), ('category', 'Geral'),
  ('platform', 'Udemy'), ('platform', 'Alura'), ('platform', 'Coursera'), ('platform', 'YouTube'),
  ('platform', 'Faculdade'), ('platform', 'NetAcad'), ('platform', 'Livro'), ('platform', 'Outro');

-- o que já estava em uso nos cursos
INSERT OR IGNORE INTO lc_options (kind, name) SELECT 'category', TRIM(category) FROM lc_courses WHERE TRIM(category) <> '';
INSERT OR IGNORE INTO lc_options (kind, name) SELECT 'platform', TRIM(platform) FROM lc_courses WHERE TRIM(platform) <> '';
