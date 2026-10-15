-- Blocos de estudo avulsos (uma ocorrência só), por exemplo "remarcar para hoje" um bloco perdido.
-- Diferente de lc_study_plan (que se repete toda semana). Entram no backup.
-- from_plan_id/from_date guardam de qual bloco do plano (e de qual dia) este avulso veio, para o bloco original
-- deixar de aparecer como "perdido". from_plan_id não é chave estrangeira: o bloco do plano pode ser apagado depois.
CREATE TABLE lc_study_once (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  start_time   TEXT    NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 600),
  course_id    INTEGER REFERENCES lc_courses(id) ON DELETE SET NULL,
  from_plan_id INTEGER,
  from_date    TEXT,
  created_at   TEXT    NOT NULL
);
CREATE INDEX idx_study_once_date ON lc_study_once(date);
