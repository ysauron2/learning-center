-- Anotações em Markdown, opcionalmente ligadas a um curso e a uma aula.
-- Apagar o curso ou a aula NÃO apaga a anotação: ela só perde o vínculo.
CREATE TABLE lc_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL DEFAULT '',
  body_md    TEXT    NOT NULL DEFAULT '',
  course_id  INTEGER REFERENCES lc_courses(id) ON DELETE SET NULL,
  lesson_id  INTEGER REFERENCES lc_lessons(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX idx_lc_notes_course  ON lc_notes(course_id);
CREATE INDEX idx_lc_notes_lesson  ON lc_notes(lesson_id);
CREATE INDEX idx_lc_notes_updated ON lc_notes(updated_at);

CREATE TABLE lc_note_tags (
  note_id INTEGER NOT NULL REFERENCES lc_notes(id) ON DELETE CASCADE,
  tag     TEXT    NOT NULL,
  PRIMARY KEY (note_id, tag)
);
