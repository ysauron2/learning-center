// Dados de DEMONSTRAÇÃO para desenvolvimento. Não use em dados reais.
// Uso: npm run seed:demo   (DATABASE_FILE opcional)
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDb } from '../src/core/db.js';
import { createLearningCenter } from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const file = resolve(process.env.DATABASE_FILE ?? resolve(root, 'data/learning-center.db'));
const db = openDb(file);
const lc = createLearningCenter({ db });

if (lc.courses.list().length > 0) {
  console.log('O banco já possui cursos; nada foi alterado.');
  process.exit(0);
}

const redes = lc.courses.create({
  title: '[DEMO] Redes de Computadores', platform: 'Udemy', category: 'Redes',
  description: 'Curso de exemplo cadastrado manualmente.', status: 'active', manualProgress: 0, tags: ['redes', 'fundamentos'],
});
const m1 = lc.courses.addModule(redes.id, { title: 'Fundamentos' });
const m2 = lc.courses.addModule(redes.id, { title: 'Modelo TCP/IP' });
lc.courses.addLesson(m1.id, { title: 'O que é uma rede', durationMin: 12 });
lc.courses.addLesson(m1.id, { title: 'Modelo OSI', durationMin: 25 });
lc.courses.addLesson(m2.id, { title: 'Camadas do TCP/IP', durationMin: 20 });
lc.courses.addLesson(m2.id, { title: 'Endereçamento IP', durationMin: 30 });
lc.courses.updateLesson(1, { completed: true });
lc.courses.updateLesson(2, { completed: true });

lc.courses.create({ title: '[DEMO] Linux para Profissionais', platform: 'YouTube', category: 'Linux', status: 'active', manualProgress: 40, tags: ['linux'] });
lc.courses.create({ title: '[DEMO] Preparatório CCNA', platform: 'NetAcad', category: 'Redes', status: 'paused', manualProgress: 20, tags: ['redes', 'certificação'] });

for (let d = 0; d < 6; d += 1) {
  const day = new Date();
  day.setDate(day.getDate() - d);
  day.setHours(20, 0, 0, 0);
  lc.sessions.logManual({ courseId: redes.id, durationMin: 30 + ((d * 17) % 45), startedAt: day.toISOString(), notes: 'demo' });
}
console.log('Dados de demonstração criados em', file);
