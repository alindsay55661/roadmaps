export const requiredEnvVars = {
  SESSION_SECRET: '',
  APP_URL: '',
  BOOTSTRAP_ADMIN_EMAIL: '',
  BOOTSTRAP_ADMIN_PASSWORD: '',
} as const

export type RequiredEnvVars = typeof requiredEnvVars & {
  SYSTEM_AGENT: DurableObjectNamespace
  USER_AGENT: DurableObjectNamespace
  TEAM_AGENT: DurableObjectNamespace
  TIMELINE_SESSION_AGENT: DurableObjectNamespace
  DOT_VOTING_SESSION_AGENT: DurableObjectNamespace
  PROPERTY_VOTING_SESSION_AGENT: DurableObjectNamespace
  ENVIRONMENT: string
  MAX_APP_ADMINS?: string
  EMAIL_PROVIDER?: string
  EMAIL_FROM?: string
  EMAIL_FROM_NAME?: string
  RESEND_API_KEY?: string
  POSTMARK_SERVER_TOKEN?: string
  SENDGRID_API_KEY?: string
  LINEAR_API_KEY?: string
  AI_PROVIDER?: string
  AI_MODEL?: string
  AI_BASE_URL?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_STUDIO_API_KEY?: string
  GOOGLE_AI_STUDIO_BASE_URL?: string
  /** @deprecated Use GOOGLE_AI_STUDIO_API_KEY */
  GOOGLE_GENERATIVE_AI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  OPENROUTER_API_KEY?: string
}
