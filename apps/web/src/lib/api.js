const BASE = import.meta.env?.VITE_API_BASE ?? '/api/v1';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Não foi possível falar com o servidor. Verifique sua conexão.');
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Algo deu errado.', e?.details);
  }
  return json?.data ?? null;
}

const qs = (params = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== null) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  dashboard: () => request('GET', '/dashboard'),
  courses: (filters) => request('GET', `/courses${qs(filters)}`),
  courseSummary: () => request('GET', '/courses/summary'),
  course: (id) => request('GET', `/courses/${id}`),
  createCourse: (data) => request('POST', '/courses', data),
  updateCourse: (id, data) => request('PATCH', `/courses/${id}`, data),
  setCourseStatus: (id, status) => request('POST', `/courses/${id}/status`, { status }),
  importPreview: (items) => request('POST', '/courses/import/preview', { items }),
  importCourses: (items) => request('POST', '/courses/import', { items }),
  deleteCourse: (id) => request('DELETE', `/courses/${id}`),
  addModule: (courseId, title) => request('POST', `/courses/${courseId}/modules`, { title }),
  deleteModule: (id) => request('DELETE', `/modules/${id}`),
  addLesson: (moduleId, data) => request('POST', `/modules/${moduleId}/lessons`, data),
  updateLesson: (id, data) => request('PATCH', `/lessons/${id}`, data),
  deleteLesson: (id) => request('DELETE', `/lessons/${id}`),
  activeSession: () => request('GET', '/sessions/active'),
  sessions: (filters) => request('GET', `/sessions${qs(filters)}`),
  startSession: (data) => request('POST', '/sessions/start', data),
  pauseSession: (id) => request('POST', `/sessions/${id}/pause`),
  resumeSession: (id) => request('POST', `/sessions/${id}/resume`),
  finishSession: (id, data) => request('POST', `/sessions/${id}/finish`, data),
  discardSession: (id) => request('DELETE', `/sessions/${id}`),
  logManual: (data) => request('POST', '/sessions/manual', data),
  weeklyGoal: () => request('GET', '/goals/weekly'),
  setWeeklyGoal: (targetMinutes) => request('PUT', '/goals/weekly', { targetMinutes }),
};
