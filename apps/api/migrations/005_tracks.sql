-- Trilhas: sequências ordenadas de etapas. Uma etapa é um curso (o progresso vem do curso)
-- ou uma etapa livre com título (ex.: "prova de certificação"), que se marca à mão.
-- Apagar um curso o tira das trilhas; a trilha continua.
CREATE TABLE lc_tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE lc_track_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id  INTEGER NOT NULL REFERENCES lc_tracks(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  course_id INTEGER REFERENCES lc_courses(id) ON DELETE CASCADE,
  title     TEXT    NOT NULL DEFAULT '',
  done_at   TEXT,
  CHECK (course_id IS NOT NULL OR length(trim(title)) > 0)
);
CREATE UNIQUE INDEX idx_lc_track_items_course ON lc_track_items(track_id, course_id) WHERE course_id IS NOT NULL;
CREATE INDEX idx_lc_track_items_track ON lc_track_items(track_id, position);
