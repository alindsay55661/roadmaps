import { index, layout, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  route('login', 'routes/login.tsx'),
  route('logout', 'routes/logout.ts'),
  route('forgot-password', 'routes/forgot-password.tsx'),
  route('reset-password/:token', 'routes/reset-password.tsx'),
  route('invite/:token', 'routes/invite.tsx'),
  route('change-password', 'routes/change-password.tsx'),
  layout('routes/_app.tsx', [
    index('routes/home.tsx'),
    route('admin/users', 'routes/admin.users.tsx'),
    route('teams', 'routes/teams.tsx'),
    route('teams/:teamId', 'routes/teams.$teamId.tsx'),
    route('roadmap/:uuid', 'routes/roadmap.$uuid.tsx'),
    route('roadmap/:uuid/settings', 'routes/roadmap.$uuid.settings.tsx'),
    route('voting/:uuid', 'routes/voting.$uuid.tsx'),
    route('voting/:uuid/settings', 'routes/voting.$uuid.settings.tsx'),
    route('property-voting/:uuid', 'routes/property-voting.$uuid.tsx'),
    route('property-voting/:uuid/settings', 'routes/property-voting.$uuid.settings.tsx'),
    route('dev/property-voting-chart', 'routes/dev.property-voting-chart.tsx'),
  ]),
  // Catch-all route for 404s (must be last!)
  route('*', 'routes/$.tsx'),
] satisfies RouteConfig
