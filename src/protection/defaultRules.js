export const DEFAULT_PROTECTION_RULES = [
	{
		pattern: '.env',
		patternType: 'exact',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Protect the main environment file.'
	},
	{
		pattern: '.env.*',
		patternType: 'glob',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Protect environment variants.'
	},
	{
		pattern: 'security',
		patternType: 'dirname',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Hide and protect security-owned files.'
	},
	{
		pattern: 'secrets',
		patternType: 'dirname',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Hide and protect secrets directories.'
	},
	{
		pattern: '**/credentials.json',
		patternType: 'glob',
		effect: 'deny',
		scope: 'system',
		priority: 15,
		note: 'Protect common credentials files.'
	},
	{
		pattern: 'mcp/mcp.json',
		patternType: 'exact',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Protect MCP server configuration (may contain API keys).'
	},
	{
		pattern: '**/*.db',
		patternType: 'glob',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Protect SQLite database files (user data, sessions, conversations).'
	},
	{
		pattern: '**/*.db-shm',
		patternType: 'glob',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Protect SQLite shared-memory files.'
	},
	{
		pattern: '**/*.db-wal',
		patternType: 'glob',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Protect SQLite WAL files.'
	},
	{
		pattern: 'src',
		patternType: 'dirname',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Protect application source code from agent access.'
	},
	{
		pattern: 'skills',
		patternType: 'dirname',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Protect skill definitions from agent tampering.'
	},
	{
		pattern: 'tools',
		patternType: 'dirname',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Protect tool plugin definitions from agent tampering.'
	},
	{
		pattern: 'node_modules',
		patternType: 'dirname',
		effect: 'deny',
		scope: 'system',
		priority: 10,
		note: 'Protect dependencies from agent access (supply-chain attack prevention).'
	}
]
