export function dashboardRoutes(app, { dashboard }) {
  app.get('/dashboard', async () => ({ data: dashboard.get() }));
}
