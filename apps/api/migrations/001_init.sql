-- Learning Center · esquema inicial (MVP)
-- Todas as tabelas usam o prefixo lc_ para conviver com o banco do Meu Hub no futuro.

CREATE TABLE lc_courses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  platform        TEXT    NOT NULL DEFAULT 'Outro',
  category        TEXT    NOT NULL DEFAULT 'Geral',
  description     TEXT    NOT NULL DEFAULT '',
  url             TEXT,
  status          TEXT    NOT NULL DEFAULT 'active'
                  CHECK (status IN ('planned','active','paused','completed')),
  manual_progress INTEGER NOT NULL DEFAULT 0 CHECK (manual_progress BETWEEN 0 AND 100),
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE TABLE lc_course_tags (
  course_id INTEGER NOT NULL REFERENCES lc_courses(id) ON DELETE CASCADE,
  tag       TEXT    NOT NULL,
  PRIMARY KEY (course_id, tag)
);

CREATE TABLE lc_modules (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES lc_courses(id) ON DELETE CASCADE,
  title     TEXT    NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_lc_modules_course ON lc_modules(course_id, position);

CREATE TABLE lc_lessons (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id         INTEGER NOT NULL REFERENCES lc_modules(id) ON DELETE CASCADE,
  course_id         INTEGER NOT NULL REFERENCES lc_courses(id) ON DELETE CASCADE,
  title             TEXT    NOT NULL,
  duration_min      INTEGER NOT NULL DEFAULT 0 CHECK (duration_min >= 0),
  position          INTEGER NOT NULL DEFAULT 0,
  completed_at      TEXT,
  last_position_sec INTEGER NOT NULL DEFAULT 0 CHECK (last_position_sec >= 0)
);
CREATE INDEX idx_lc_lessons_course ON lc_lessons(course_id);
CREATE INDEX idx_lc_lessons_module ON lc_lessons(module_id, position);

CREATE TABLE lc_study_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id        INTEGER REFERENCES lc_courses(id) ON DELETE SET NULL,
  lesson_id        INTEGER REFERENCES lc_lessons(id) ON DELETE SET NULL,
  kind             TEXT    NOT NULL DEFAULT 'pomodoro' CHECK (kind IN ('pomodoro','stopwatch','manual')),
  planned_min      INTEGER,
  started_at       TEXT    NOT NULL,
  paused_at        TEXT,
  paused_total_sec INTEGER NOT NULL DEFAULT 0,
  ended_at         TEXT,
  duration_sec     INTEGER NOT NULL DEFAULT 0,
  focus_rating     INTEGER CHECK (focus_rating BETWEEN 1 AND 5),
  notes            TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX idx_lc_sessions_started ON lc_study_sessions(started_at);
CREATE INDEX idx_lc_sessions_course  ON lc_study_sessions(course_id);

CREATE TABLE lc_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO lc_settings (key, value) VALUES ('weekly_goal_minutes', '480');
