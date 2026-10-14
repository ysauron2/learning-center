import { buildApp } from '../src/app.js';
import { fixedClock } from '../src/core/time.js';

/** App em memória com relógio controlado (quarta-feira, 2026-03-11 15:00 local). */
export async function makeApp(startIso = '2026-03-11T15:00:00') {
  const clock = fixedClock(startIso);
  const app = await buildApp({ databaseFile: ':memory:', clock });
  const call = async (method, url, payload) => {
    const res = await app.inject({ method, url: `/api/v1${url}`, payload });
    return { status: res.statusCode, body: res.body ? safeJson(res.body) : null };
  };
  return { app, clock, call };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
