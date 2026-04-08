import 'dotenv/config'
import path from 'node:path'

function parseInteger(value, fallback) {
	const parsed = Number.parseInt(String(value ?? ''), 10)
	return Number.isInteger(parsed) ? parsed : fallback
}

function parseCsv(value) {
	return String(value || '')
		.split(',')
		.map(entry => entry.trim())
		.filter(Boolean)
}

export const appConfig = {
	apiPort: parseInteger(process.env.API_PORT, 4310),
	projectRoot: path.resolve(process.env.PROJECT_ROOT_DIR || process.cwd()),
	dbPath: process.env.APP_DB_PATH || 'app-v2.db',
	llmProvider: String(process.env.LLM_PROVIDER || 'anthropic').trim().toLowerCase(),
	maxTokens: parseInteger(process.env.LLM_MAX_TOKENS, 8192),
	authSessionTtlHours: parseInteger(process.env.AUTH_SESSION_TTL_HOURS, 24),
	adminSessionTtlHours: parseInteger(process.env.ADMIN_SESSION_TTL_HOURS, 12),
	allowedOrigins: parseCsv(process.env.ALLOWED_ORIGINS),
	cookieName: process.env.AUTH_COOKIE_NAME || 'microharnessengine_session',
	adminCookieName: process.env.ADMIN_AUTH_COOKIE_NAME || 'microharnessengine_admin_session',
	slackBotToken: process.env.SLACK_BOT_TOKEN || '',
	slackSigningSecret: process.env.SLACK_SIGNING_SECRET || '',
	discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
	discordPublicKey: process.env.DISCORD_PUBLIC_KEY || '',
	discordApplicationId: process.env.DISCORD_APPLICATION_ID || '',
	bootstrapSecret: process.env.ROOT_BOOTSTRAP_SECRET || '',
	adminRuntimePassword: process.env.ADMIN_RUNTIME_PASSWORD || '',
	automationTickMs: parseInteger(process.env.AUTOMATION_TICK_MS, 30_000),
	braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY || '',
	maxBodyBytes: parseInteger(process.env.MAX_BODY_BYTES, 1_048_576),
	fsBrowseDeniedPaths: parseCsv(process.env.FS_BROWSE_DENIED_PATHS)
}

export function isOriginAllowed(origin) {
	if (!origin) {
		return false
	}

	if (appConfig.allowedOrigins.length === 0) {
		return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
	}

	return appConfig.allowedOrigins.includes(origin)
}
