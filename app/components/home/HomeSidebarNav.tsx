import { Form, Link } from 'react-router'

import { CreateTeamDialog } from './CreateTeamDialog'

type HomeSidebarNavProps = {
  contextKey: string
  teamId: string | null
  teams: Array<{ id: string; name: string; sessionCount: number }>
  draftCount: number
  sharedCount: number
  userEmail: string
  userRole: string
  onNavigate?: () => void
  onSelectDrafts: () => void
  onSelectShared: () => void
  onSelectTeam: (teamId: string) => void
}

function SidebarDivider() {
  return <div className="sidebar-divider" role="separator" />
}

type NavItemButtonProps = {
  isActive: boolean
  label: string
  count: number
  onClick: () => void
}

function NavItemButton({ isActive, label, count, onClick }: NavItemButtonProps) {
  return (
    <button
      type="button"
      className={`${isActive ? 'nav-item-active' : 'nav-item'} flex w-full items-center justify-between gap-2`}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{count}</span>
    </button>
  )
}

export function HomeSidebarNav({
  contextKey,
  teamId,
  teams,
  draftCount,
  sharedCount,
  userEmail,
  userRole,
  onNavigate,
  onSelectDrafts,
  onSelectShared,
  onSelectTeam,
}: HomeSidebarNavProps) {
  function handleDrafts() {
    onSelectDrafts()
    onNavigate?.()
  }

  function handleShared() {
    onSelectShared()
    onNavigate?.()
  }

  function handleTeam(id: string) {
    onSelectTeam(id)
    onNavigate?.()
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-primary text-lg font-semibold">Roadmaps</div>
        <p className="text-muted-foreground mt-1 truncate text-xs">Signed in as {userEmail}</p>
      </div>

      <SidebarDivider />

      <nav className="grid gap-1 text-sm" aria-label="Sessions">
        <NavItemButton
          isActive={contextKey === 'drafts'}
          label="Drafts"
          count={draftCount}
          onClick={handleDrafts}
        />

        <NavItemButton
          isActive={contextKey === 'shared'}
          label="Shared with me"
          count={sharedCount}
          onClick={handleShared}
        />

        {teams.map((team) => (
          <NavItemButton
            key={team.id}
            isActive={contextKey === 'team' && teamId === team.id}
            label={team.name}
            count={team.sessionCount}
            onClick={() => handleTeam(team.id)}
          />
        ))}

        <CreateTeamDialog onNavigate={onNavigate} />
      </nav>

      <SidebarDivider />

      <nav className="grid gap-1 text-sm" aria-label="Account">
        {userRole === 'app_admin' && (
          <Link to="/admin/users" className="nav-item block" onClick={onNavigate}>
            App administration
          </Link>
        )}
        <Link to="/change-password" className="nav-item block" onClick={onNavigate}>
          Change password
        </Link>

        <Form method="post" action="/logout">
          <button type="submit" className="nav-item w-full text-left">
            Sign out
          </button>
        </Form>
      </nav>
    </>
  )
}
