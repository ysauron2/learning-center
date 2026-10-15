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
  importPreview: (items) => request('POST', '/courses/import/preview', { items, updateProgress: true }),
  importCourses: (items, category) => request('POST', '/courses/import', { items, updateProgress: true, ...(category ? { category } : {}) }),
  importContentPreview: (id, modules, url) => request('POST', `/courses/${id}/import-content/preview`, { modules, url }),
  importContent: (id, modules, url) => request('POST', `/courses/${id}/import-content`, { modules, url }),
  youtubePreview: (data) => request('POST', '/courses/import-youtube/preview', data),
  importYoutube: (data) => request('POST', '/courses/import-youtube', data),
  textPreview: (data) => request('POST', '/courses/import-text/preview', data),
  importText: (data) => request('POST', '/courses/import-text', data),
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
  analytics: (range = '30d') => request('GET', `/analytics?range=${range}`),
  calendarStatus: () => request('GET', '/calendar/status'),
  calendarConfig: (data) => request('PUT', '/calendar/config', data),
  calendarConnect: () => request('POST', '/calendar/connect'),
  calendarDisconnect: () => request('POST', '/calendar/disconnect'),
  calendarSettings: (data) => request('PATCH', '/calendar/settings', data),
  calendarEvents: (days = 7, refresh = false) => request('GET', `/calendar/events?days=${days}${refresh ? '&refresh=1' : ''}`),
  calendarPlan: () => request('GET', '/calendar/plan'),
  addPlanBlock: (data) => request('POST', '/calendar/plan', data),
  updatePlanBlock: (id, data) => request('PATCH', `/calendar/plan/${id}`, data),
  removePlanBlock: (id) => request('DELETE', `/calendar/plan/${id}`),
  calendarSync: () => request('POST', '/calendar/sync'),
  calendarMissed: () => request('GET', '/calendar/missed'),
  addOnceBlock: (data) => request('POST', '/calendar/once', data),
  removeOnceBlock: (id) => request('DELETE', `/calendar/once/${id}`),
  calendarUpcoming: (days = 7) => request('GET', `/calendar/upcoming?days=${days}`),
  notionStatus: () => request('GET', '/notion/status'),
  notionToken: (token) => request('PUT', '/notion/token', { token }),
  notionPages: () => request('GET', '/notion/pages'),
  notionConnect: (pageId) => request('POST', '/notion/connect', { pageId }),
  notionDisconnect: () => request('POST', '/notion/disconnect'),
  notionSettings: (data) => request('PATCH', '/notion/settings', data),
  notionSync: () => request('POST', '/notion/sync'),
  options: () => request('GET', '/options'),
  createOption: (kind, name) => request('POST', `/options/${kind}`, { name }),
  renameOption: (kind, name, newName) => request('PATCH', `/options/${kind}`, { name, newName }),
  deleteOption: (kind, name) => request('DELETE', `/options/${kind}?name=${encodeURIComponent(name)}`),
  notes: (filters) => request('GET', `/notes${qs(filters)}`),
  noteTags: () => request('GET', '/notes/tags'),
  note: (id) => request('GET', `/notes/${id}`),
  createNote: (data) => request('POST', '/notes', data),
  updateNote: (id, data) => request('PATCH', `/notes/${id}`, data),
  deleteNote: (id) => request('DELETE', `/notes/${id}`),
  tracks: () => request('GET', '/tracks'),
  track: (id) => request('GET', `/tracks/${id}`),
  createTrack: (data) => request('POST', '/tracks', data),
  updateTrack: (id, data) => request('PATCH', `/tracks/${id}`, data),
  deleteTrack: (id) => request('DELETE', `/tracks/${id}`),
  addTrackItem: (id, data) => request('POST', `/tracks/${id}/items`, data),
  updateTrackItem: (id, itemId, data) => request('PATCH', `/tracks/${id}/items/${itemId}`, data),
  removeTrackItem: (id, itemId) => request('DELETE', `/tracks/${id}/items/${itemId}`),
  reorderTrack: (id, itemIds) => request('PUT', `/tracks/${id}/order`, { itemIds }),
  backup: () => request('GET', '/backup'),
  backupPreview: (backup) => request('POST', '/backup/preview', { backup }),
  backupRestore: (backup) => request('POST', '/backup/restore', { confirm: 'substituir-tudo', backup }),
  weeklyGoal: () => request('GET', '/goals/weekly'),
  setWeeklyGoal: (targetMinutes) => request('PUT', '/goals/weekly', { targetMinutes }),
};
