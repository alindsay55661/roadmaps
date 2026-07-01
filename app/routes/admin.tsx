import { Link, NavLink, Outlet } from 'react-router'

import { requireAdmin } from '../auth/session.server'
import type { Route } from './+types/admin'

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  await requireAdmin(request, context.cloudflare.env)
  return null
}

const adminNavItems = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/teams', label: 'Teams' },
  { to: '/admin/unassigned', label: 'Unassigned' },
]

export default function AdminLayout() {
  return (
    <div className="page max-w-5xl">
      <Link to="/" className="link-back">
        ← Home
      </Link>

      <div className="mt-4 mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">App Administration</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage users, teams, and unassigned content.</p>
        </div>

        <nav className="flex gap-2 text-sm" aria-label="App administration">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${isActive ? 'nav-item-active' : 'nav-item'} rounded-md px-3 py-2`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  )
}
