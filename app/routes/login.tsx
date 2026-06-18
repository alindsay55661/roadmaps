import { Form, Link, redirect, useActionData } from 'react-router'
import { verifyPassword } from 'utils/password'

import { createUserSession, getActiveSessionUser } from '../auth/session.server'
import { getSystemAgent } from '../data/agents.server'
import type { Route } from './+types/login'

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const user = await getActiveSessionUser(request, context.cloudflare.env)

  if (user) throw redirect(user.mustChangePassword ? '/change-password' : '/')

  return null
}

export const action = async ({ request, context }: Route.ActionArgs) => {
  const env = context.cloudflare.env

  const formData = await request.formData()

  const email = String(formData.get('email') ?? '')

  const password = String(formData.get('password') ?? '')

  const system = await getSystemAgent(env)

  const userResult = await system.getUserByEmail(email)

  if (!userResult.ok || !userResult.body) {
    return { error: "We couldn't find an account with that email and password." }
  }

  const user = userResult.body

  if (user.status !== 'active') return { error: 'Account deactivated' }

  const valid = await verifyPassword(password, user.passwordHash)

  if (!valid) return { error: "We couldn't find an account with that email and password." }

  const cookie = await createUserSession({
    request,

    env,

    user: {
      email: user.email,

      role: user.role,

      mustChangePassword: user.mustChangePassword,
    },
  })

  throw redirect(user.mustChangePassword ? '/change-password' : '/', {
    headers: { 'Set-Cookie': cookie },
  })
}

export default function LoginPage() {
  const actionData = useActionData<typeof action>()

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <h1 className="mb-6 text-2xl font-semibold">Sign in to Roadmaps</h1>

        <Form method="post" className="grid gap-4">
          <label className="grid gap-1 text-sm">
            Email
            <input name="email" type="email" required className="field" />
          </label>

          <label className="grid gap-1 text-sm">
            Password
            <input name="password" type="password" required className="field" />
          </label>

          {actionData?.error && <p className="text-destructive text-sm">{actionData.error}</p>}

          <button type="submit" className="btn btn-primary">
            Sign in
          </button>
        </Form>

        <p className="text-muted-foreground mt-4 text-center text-sm">
          <Link to="/forgot-password" className="text-primary font-medium hover:text-blue-700">
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  )
}
