import Database from 'better-sqlite3'
import { appConfig } from './config.js'
import { createId, nowIso } from './security.js'
import {
	DEFAULT_FILE_POLICY_NAME,
	DEFAULT_TOOL_POLICY_NAME,
	LEGACY_FULL_ACCESS_TOOL_POLICY_NAME,
	LEGACY_WORKSPACE_FILE_POLICY_NAME,
	ROOT_DISPLAY_NAME,
	ROOT_LOGIN_NAME,
	ROOT_SYSTEM_USER_TYPE,
	SYSTEM_ALL_TOOLS_POLICY_NAME
} from './systemDefaults.js'
import { DEFAULT_PROTECTION_RULES } from '../protection/defaultRules.js'

const db = new Database(appConfig.dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

function hasColumn(tableName, columnName) {
	return db.pragma(`table_info(${tableName})`).some(column => column.name === columnName)
}

db.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE,
		display_name TEXT NOT NULL,
		password_hash TEXT,
		password_salt TEXT,
		role TEXT NOT NULL DEFAULT 'user',
		status TEXT NOT NULL DEFAULT 'active',
		auth_source TEXT NOT NULL DEFAULT 'local',
		system_user_type TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		last_login_at TEXT
	);

	CREATE TABLE IF NOT EXISTS auth_sessions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		csrf_token TEXT NOT NULL,
		expires_at TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		user_agent TEXT,
		ip_hash TEXT,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
	ON auth_sessions(user_id, expires_at);

	CREATE TABLE IF NOT EXISTS personal_access_tokens (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		name TEXT NOT NULL,
		token_hash TEXT NOT NULL UNIQUE,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		last_used_at TEXT,
		revoked_at TEXT,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS channel_identities (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		type TEXT NOT NULL,
		identity_key TEXT NOT NULL UNIQUE,
		display_label TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'active',
		metadata_json TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS conversations (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		channel_identity_id TEXT NOT NULL,
		title TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'active',
		source TEXT NOT NULL,
		external_ref TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		last_message_at TEXT,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(channel_identity_id) REFERENCES channel_identities(id) ON DELETE CASCADE,
		UNIQUE(channel_identity_id, external_ref)
	);

	CREATE INDEX IF NOT EXISTS idx_conversations_user
	ON conversations(user_id, status, updated_at);

	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		conversation_id TEXT NOT NULL,
		role TEXT NOT NULL,
		author_user_id TEXT,
		content_text TEXT NOT NULL,
		content_json TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
		FOREIGN KEY(author_user_id) REFERENCES users(id) ON DELETE SET NULL
	);

	CREATE INDEX IF NOT EXISTS idx_messages_conversation
	ON messages(conversation_id, created_at);

	CREATE TABLE IF NOT EXISTS agent_runs (
		id TEXT PRIMARY KEY,
		conversation_id TEXT NOT NULL,
		status TEXT NOT NULL,
		trigger_type TEXT NOT NULL,
		trigger_message_id TEXT,
		automation_id TEXT,
		provider_name TEXT NOT NULL,
		phase TEXT NOT NULL,
		snapshot_json TEXT,
		last_error TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		completed_at TEXT,
		FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation
	ON agent_runs(conversation_id, status, updated_at);

	CREATE TABLE IF NOT EXISTS conversation_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_id TEXT NOT NULL UNIQUE,
		conversation_id TEXT NOT NULL,
		run_id TEXT,
		kind TEXT NOT NULL,
		payload_json TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation
	ON conversation_events(conversation_id, id);

	CREATE TABLE IF NOT EXISTS approvals (
		id TEXT PRIMARY KEY,
		conversation_id TEXT NOT NULL,
		run_id TEXT NOT NULL,
		requester_user_id TEXT NOT NULL,
		channel_identity_id TEXT NOT NULL,
		tool_name TEXT NOT NULL,
		tool_input_json TEXT NOT NULL,
		reason TEXT NOT NULL,
		status TEXT NOT NULL,
		requested_at TEXT NOT NULL,
		expires_at TEXT,
		decided_at TEXT,
		decided_by_user_id TEXT,
		decision_note TEXT,
		FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
		FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
		FOREIGN KEY(requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(channel_identity_id) REFERENCES channel_identities(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_approvals_conversation
	ON approvals(conversation_id, status, requested_at);

	CREATE TABLE IF NOT EXISTS run_tool_calls (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		run_id TEXT NOT NULL,
		tool_use_id TEXT NOT NULL,
		tool_name TEXT NOT NULL,
		input_json TEXT,
		output_json TEXT,
		status TEXT NOT NULL,
		error_text TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		completed_at TEXT,
		UNIQUE(run_id, tool_use_id)
	);

	CREATE TABLE IF NOT EXISTS automations (
		id TEXT PRIMARY KEY,
		owner_user_id TEXT NOT NULL,
		channel_identity_id TEXT NOT NULL,
		conversation_id TEXT NOT NULL,
		name TEXT NOT NULL,
		instruction TEXT NOT NULL,
		schedule_kind TEXT NOT NULL DEFAULT 'interval',
		interval_minutes INTEGER NOT NULL,
		status TEXT NOT NULL DEFAULT 'active',
		next_run_at TEXT NOT NULL,
		last_run_at TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(channel_identity_id) REFERENCES channel_identities(id) ON DELETE CASCADE,
		FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_automations_due
	ON automations(status, next_run_at);

	CREATE TABLE IF NOT EXISTS automation_runs (
		id TEXT PRIMARY KEY,
		automation_id TEXT NOT NULL,
		conversation_id TEXT NOT NULL,
		run_id TEXT,
		status TEXT NOT NULL,
		error_text TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		completed_at TEXT,
		FOREIGN KEY(automation_id) REFERENCES automations(id) ON DELETE CASCADE,
		FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS protection_rules (
		id TEXT PRIMARY KEY,
		pattern TEXT NOT NULL,
		pattern_type TEXT NOT NULL,
		effect TEXT NOT NULL DEFAULT 'deny',
		priority INTEGER NOT NULL DEFAULT 100,
		enabled INTEGER NOT NULL DEFAULT 1,
		scope TEXT NOT NULL DEFAULT 'workspace',
		note TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(pattern, pattern_type, scope)
	);

	CREATE TABLE IF NOT EXISTS protection_audit_logs (
		id TEXT PRIMARY KEY,
		session_token TEXT,
		action TEXT NOT NULL,
		target_path TEXT,
		sink TEXT,
		decision TEXT NOT NULL,
		matched_rule_id TEXT,
		reason TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
`)

if (hasColumn('protection_rules', 'action')) {
	db.exec(`
		DROP TABLE protection_rules;
		CREATE TABLE protection_rules (
			id TEXT PRIMARY KEY,
			pattern TEXT NOT NULL,
			pattern_type TEXT NOT NULL,
			effect TEXT NOT NULL DEFAULT 'deny',
			priority INTEGER NOT NULL DEFAULT 100,
			enabled INTEGER NOT NULL DEFAULT 1,
			scope TEXT NOT NULL DEFAULT 'workspace',
			note TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(pattern, pattern_type, scope)
		);
	`)
}

if (!hasColumn('users', 'login_name')) {
	db.exec(`
		ALTER TABLE users
		ADD COLUMN login_name TEXT;
	`)
	db.exec(`
		UPDATE users
		SET login_name = lower(email)
		WHERE login_name IS NULL
			AND email IS NOT NULL
	`)
}

if (!hasColumn('users', 'system_user_type')) {
	db.exec(`
		ALTER TABLE users
		ADD COLUMN system_user_type TEXT;
	`)
}

db.exec(`
	CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_name
	ON users(login_name)
	WHERE login_name IS NOT NULL;

	CREATE UNIQUE INDEX IF NOT EXISTS idx_users_system_user_type
	ON users(system_user_type)
	WHERE system_user_type IS NOT NULL;

	CREATE TABLE IF NOT EXISTS tool_policies (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL UNIQUE,
		description TEXT,
		is_system INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS tool_policy_tools (
		policy_id TEXT NOT NULL,
		tool_name TEXT NOT NULL,
		PRIMARY KEY (policy_id, tool_name),
		FOREIGN KEY(policy_id) REFERENCES tool_policies(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS file_policies (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL UNIQUE,
		description TEXT,
		is_system INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS file_policy_roots (
		id TEXT PRIMARY KEY,
		policy_id TEXT NOT NULL,
		scope TEXT NOT NULL,
		root_path TEXT NOT NULL,
		path_type TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(policy_id) REFERENCES file_policies(id) ON DELETE CASCADE,
		UNIQUE(policy_id, scope, root_path, path_type)
	);

	CREATE TABLE IF NOT EXISTS user_policy_bindings (
		user_id TEXT PRIMARY KEY,
		tool_policy_id TEXT NOT NULL,
		file_policy_id TEXT NOT NULL,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(tool_policy_id) REFERENCES tool_policies(id),
		FOREIGN KEY(file_policy_id) REFERENCES file_policies(id)
	);
`)

function parseJson(value, fallback = null) {
	if (!value) {
		return fallback
	}

	try {
		return JSON.parse(value)
	} catch {
		return fallback
	}
}

function mapUser(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		loginName: row.login_name,
		email: row.email,
		displayName: row.display_name,
		role: row.role,
		status: row.status,
		authSource: row.auth_source,
		systemUserType: row.system_user_type,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		lastLoginAt: row.last_login_at,
		passwordHash: row.password_hash,
		passwordSalt: row.password_salt
	}
}

function mapChannelIdentity(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		userId: row.user_id,
		type: row.type,
		identityKey: row.identity_key,
		displayLabel: row.display_label,
		status: row.status,
		metadata: parseJson(row.metadata_json, {}),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	}
}

function mapConversation(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		userId: row.user_id,
		channelIdentityId: row.channel_identity_id,
		title: row.title,
		status: row.status,
		source: row.source,
		externalRef: row.external_ref,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		lastMessageAt: row.last_message_at,
		pendingApprovalCount: row.pending_approval_count ?? 0,
		activeRunStatus: row.active_run_status ?? null
	}
}

function mapMessage(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		conversationId: row.conversation_id,
		role: row.role,
		authorUserId: row.author_user_id,
		contentText: row.content_text,
		content: parseJson(row.content_json, null),
		createdAt: row.created_at
	}
}

function mapRun(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		conversationId: row.conversation_id,
		status: row.status,
		triggerType: row.trigger_type,
		triggerMessageId: row.trigger_message_id,
		automationId: row.automation_id,
		providerName: row.provider_name,
		phase: row.phase,
		snapshot: parseJson(row.snapshot_json, null),
		lastError: row.last_error,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		completedAt: row.completed_at
	}
}

function mapApproval(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		conversationId: row.conversation_id,
		runId: row.run_id,
		requesterUserId: row.requester_user_id,
		channelIdentityId: row.channel_identity_id,
		toolName: row.tool_name,
		toolInput: parseJson(row.tool_input_json, {}),
		reason: row.reason,
		status: row.status,
		requestedAt: row.requested_at,
		expiresAt: row.expires_at,
		decidedAt: row.decided_at,
		decidedByUserId: row.decided_by_user_id,
		decisionNote: row.decision_note
	}
}

function mapAutomation(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		ownerUserId: row.owner_user_id,
		channelIdentityId: row.channel_identity_id,
		conversationId: row.conversation_id,
		name: row.name,
		instruction: row.instruction,
		scheduleKind: row.schedule_kind,
		intervalMinutes: row.interval_minutes,
		status: row.status,
		nextRunAt: row.next_run_at,
		lastRunAt: row.last_run_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	}
}

function mapToolPolicy(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		name: row.name,
		description: row.description,
		isSystem: Boolean(row.is_system),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	}
}

function mapFilePolicy(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		name: row.name,
		description: row.description,
		isSystem: Boolean(row.is_system),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	}
}

function mapFilePolicyRoot(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		policyId: row.policy_id,
		scope: row.scope,
		rootPath: row.root_path,
		pathType: row.path_type,
		createdAt: row.created_at
	}
}

function mapUserPolicyBinding(row) {
	if (!row) {
		return null
	}

	return {
		userId: row.user_id,
		toolPolicyId: row.tool_policy_id,
		filePolicyId: row.file_policy_id,
		updatedAt: row.updated_at
	}
}

const countLocalAdminsStmt = db.prepare(`
	SELECT COUNT(*) AS count
	FROM users
	WHERE auth_source = 'local'
		AND role = 'admin'
		AND status = 'active'
`)

const getUserByEmailStmt = db.prepare(`
	SELECT *
	FROM users
	WHERE lower(email) = lower(?)
	LIMIT 1
`)

const getUserByLoginNameStmt = db.prepare(`
	SELECT *
	FROM users
	WHERE lower(login_name) = lower(?)
	LIMIT 1
`)

const getUserByIdStmt = db.prepare(`
	SELECT *
	FROM users
	WHERE id = ?
	LIMIT 1
`)

const getUserBySystemTypeStmt = db.prepare(`
	SELECT *
	FROM users
	WHERE system_user_type = ?
	LIMIT 1
`)

const insertUserStmt = db.prepare(`
	INSERT INTO users (
		id,
		login_name,
		email,
		display_name,
		password_hash,
		password_salt,
		role,
		status,
		auth_source,
		system_user_type,
		created_at,
		updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateUserLoginStmt = db.prepare(`
	UPDATE users
	SET last_login_at = ?,
		updated_at = ?
	WHERE id = ?
`)

const updateUserRecordStmt = db.prepare(`
	UPDATE users
	SET login_name = ?,
		display_name = ?,
		role = ?,
		status = ?,
		updated_at = ?
	WHERE id = ?
`)

const deleteUserStmt = db.prepare(`
	DELETE FROM users
	WHERE id = ?
`)

const updateUserPasswordStmt = db.prepare(`
	UPDATE users
	SET password_hash = ?,
		password_salt = ?,
		updated_at = ?
	WHERE id = ?
`)

const listUsersStmt = db.prepare(`
	SELECT *
	FROM users
	ORDER BY created_at ASC
`)

const listToolPoliciesStmt = db.prepare(`
	SELECT *
	FROM tool_policies
	ORDER BY is_system DESC, name ASC
`)

const getToolPolicyByIdStmt = db.prepare(`
	SELECT *
	FROM tool_policies
	WHERE id = ?
	LIMIT 1
`)

const getToolPolicyByNameStmt = db.prepare(`
	SELECT *
	FROM tool_policies
	WHERE name = ?
	LIMIT 1
`)

const insertToolPolicyStmt = db.prepare(`
	INSERT INTO tool_policies (
		id,
		name,
		description,
		is_system,
		created_at,
		updated_at
	) VALUES (?, ?, ?, ?, ?, ?)
`)

const updateToolPolicyStmt = db.prepare(`
	UPDATE tool_policies
	SET name = ?,
		description = ?,
		updated_at = ?
	WHERE id = ?
`)

const deleteToolPolicyStmt = db.prepare(`
	DELETE FROM tool_policies
	WHERE id = ?
`)

const listToolPolicyToolsStmt = db.prepare(`
	SELECT tool_name
	FROM tool_policy_tools
	WHERE policy_id = ?
	ORDER BY tool_name ASC
`)

const deleteToolPolicyToolsStmt = db.prepare(`
	DELETE FROM tool_policy_tools
	WHERE policy_id = ?
`)

const insertToolPolicyToolStmt = db.prepare(`
	INSERT INTO tool_policy_tools (
		policy_id,
		tool_name
	) VALUES (?, ?)
`)

const listFilePoliciesStmt = db.prepare(`
	SELECT *
	FROM file_policies
	ORDER BY is_system DESC, name ASC
`)

const getFilePolicyByIdStmt = db.prepare(`
	SELECT *
	FROM file_policies
	WHERE id = ?
	LIMIT 1
`)

const getFilePolicyByNameStmt = db.prepare(`
	SELECT *
	FROM file_policies
	WHERE name = ?
	LIMIT 1
`)

const insertFilePolicyStmt = db.prepare(`
	INSERT INTO file_policies (
		id,
		name,
		description,
		is_system,
		created_at,
		updated_at
	) VALUES (?, ?, ?, ?, ?, ?)
`)

const updateFilePolicyStmt = db.prepare(`
	UPDATE file_policies
	SET name = ?,
		description = ?,
		updated_at = ?
	WHERE id = ?
`)

const deleteFilePolicyStmt = db.prepare(`
	DELETE FROM file_policies
	WHERE id = ?
`)

const listFilePolicyRootsStmt = db.prepare(`
	SELECT *
	FROM file_policy_roots
	WHERE policy_id = ?
	ORDER BY created_at ASC, id ASC
`)

const getFilePolicyRootByIdStmt = db.prepare(`
	SELECT *
	FROM file_policy_roots
	WHERE id = ?
	LIMIT 1
`)

const insertFilePolicyRootStmt = db.prepare(`
	INSERT INTO file_policy_roots (
		id,
		policy_id,
		scope,
		root_path,
		path_type,
		created_at
	) VALUES (?, ?, ?, ?, ?, ?)
`)

const deleteFilePolicyRootStmt = db.prepare(`
	DELETE FROM file_policy_roots
	WHERE id = ?
`)

const getUserPolicyBindingStmt = db.prepare(`
	SELECT *
	FROM user_policy_bindings
	WHERE user_id = ?
	LIMIT 1
`)

const upsertUserPolicyBindingStmt = db.prepare(`
	INSERT INTO user_policy_bindings (
		user_id,
		tool_policy_id,
		file_policy_id,
		updated_at
	) VALUES (?, ?, ?, ?)
	ON CONFLICT(user_id) DO UPDATE SET
		tool_policy_id = excluded.tool_policy_id,
		file_policy_id = excluded.file_policy_id,
		updated_at = excluded.updated_at
`)

const insertAuthSessionStmt = db.prepare(`
	INSERT INTO auth_sessions (
		id,
		user_id,
		csrf_token,
		expires_at,
		created_at,
		last_seen_at,
		user_agent,
		ip_hash
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const getAuthSessionStmt = db.prepare(`
	SELECT *
	FROM auth_sessions
	WHERE id = ?
	LIMIT 1
`)

const touchAuthSessionStmt = db.prepare(`
	UPDATE auth_sessions
	SET last_seen_at = ?,
		expires_at = ?,
		user_agent = COALESCE(?, user_agent),
		ip_hash = COALESCE(?, ip_hash)
	WHERE id = ?
`)

const deleteAuthSessionStmt = db.prepare(`
	DELETE FROM auth_sessions
	WHERE id = ?
`)

const deleteExpiredAuthSessionsStmt = db.prepare(`
	DELETE FROM auth_sessions
	WHERE expires_at <= ?
`)

const deleteSessionsByUserIdStmt = db.prepare(`
	DELETE FROM auth_sessions
	WHERE user_id = ?
`)

const insertPersonalAccessTokenStmt = db.prepare(`
	INSERT INTO personal_access_tokens (
		id,
		user_id,
		name,
		token_hash,
		created_at
	) VALUES (?, ?, ?, ?, ?)
`)

const listPersonalAccessTokensStmt = db.prepare(`
	SELECT id, user_id, name, created_at, last_used_at, revoked_at
	FROM personal_access_tokens
	WHERE user_id = ?
	ORDER BY created_at DESC
`)

const getPersonalAccessTokenByHashStmt = db.prepare(`
	SELECT *
	FROM personal_access_tokens
	WHERE token_hash = ?
		AND revoked_at IS NULL
	LIMIT 1
`)

const touchPersonalAccessTokenStmt = db.prepare(`
	UPDATE personal_access_tokens
	SET last_used_at = ?
	WHERE id = ?
`)

const revokePersonalAccessTokenStmt = db.prepare(`
	UPDATE personal_access_tokens
	SET revoked_at = ?
	WHERE id = ?
		AND user_id = ?
`)

const getChannelIdentityByKeyStmt = db.prepare(`
	SELECT *
	FROM channel_identities
	WHERE identity_key = ?
	LIMIT 1
`)

const insertChannelIdentityStmt = db.prepare(`
	INSERT INTO channel_identities (
		id,
		user_id,
		type,
		identity_key,
		display_label,
		status,
		metadata_json,
		created_at,
		updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateChannelIdentityStmt = db.prepare(`
	UPDATE channel_identities
	SET display_label = ?,
		status = ?,
		metadata_json = ?,
		updated_at = ?
	WHERE id = ?
`)

const getChannelIdentityByIdStmt = db.prepare(`
	SELECT *
	FROM channel_identities
	WHERE id = ?
	LIMIT 1
`)

const findConversationByExternalRefStmt = db.prepare(`
	SELECT *
	FROM conversations
	WHERE channel_identity_id = ?
		AND external_ref = ?
		AND status = 'active'
	LIMIT 1
`)

const insertConversationStmt = db.prepare(`
	INSERT INTO conversations (
		id,
		user_id,
		channel_identity_id,
		title,
		status,
		source,
		external_ref,
		created_at,
		updated_at,
		last_message_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateConversationStmt = db.prepare(`
	UPDATE conversations
	SET title = ?,
		status = ?,
		updated_at = ?,
		last_message_at = ?
	WHERE id = ?
`)

const getConversationByIdStmt = db.prepare(`
	SELECT c.*,
		(
			SELECT COUNT(*)
			FROM approvals a
			WHERE a.conversation_id = c.id
				AND a.status = 'pending'
		) AS pending_approval_count,
		(
			SELECT status
			FROM agent_runs r
			WHERE r.conversation_id = c.id
				AND r.status IN ('queued', 'running', 'waiting_approval', 'recovering')
			ORDER BY r.created_at DESC
			LIMIT 1
		) AS active_run_status
	FROM conversations c
	WHERE c.id = ?
	LIMIT 1
`)

const listConversationsForUserStmt = db.prepare(`
	SELECT c.*,
		(
			SELECT COUNT(*)
			FROM approvals a
			WHERE a.conversation_id = c.id
				AND a.status = 'pending'
		) AS pending_approval_count,
		(
			SELECT status
			FROM agent_runs r
			WHERE r.conversation_id = c.id
				AND r.status IN ('queued', 'running', 'waiting_approval', 'recovering')
			ORDER BY r.created_at DESC
			LIMIT 1
		) AS active_run_status
	FROM conversations c
	WHERE c.user_id = ?
	ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC, c.created_at DESC
`)

const insertMessageStmt = db.prepare(`
	INSERT INTO messages (
		id,
		conversation_id,
		role,
		author_user_id,
		content_text,
		content_json,
		created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const listMessagesByConversationStmt = db.prepare(`
	SELECT *
	FROM messages
	WHERE conversation_id = ?
	ORDER BY created_at ASC, id ASC
`)

const getMessageByIdStmt = db.prepare(`
	SELECT *
	FROM messages
	WHERE id = ?
	LIMIT 1
`)

const insertEventStmt = db.prepare(`
	INSERT INTO conversation_events (
		event_id,
		conversation_id,
		run_id,
		kind,
		payload_json,
		created_at
	) VALUES (?, ?, ?, ?, ?, ?)
`)

const listEventsByConversationStmt = db.prepare(`
	SELECT *
	FROM conversation_events
	WHERE conversation_id = ?
		AND id > ?
	ORDER BY id ASC
	LIMIT ?
`)

const insertRunStmt = db.prepare(`
	INSERT INTO agent_runs (
		id,
		conversation_id,
		status,
		trigger_type,
		trigger_message_id,
		automation_id,
		provider_name,
		phase,
		snapshot_json,
		last_error,
		created_at,
		updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateRunStmt = db.prepare(`
	UPDATE agent_runs
	SET status = ?,
		phase = ?,
		snapshot_json = ?,
		last_error = ?,
		updated_at = ?,
		completed_at = ?
	WHERE id = ?
`)

const getRunByIdStmt = db.prepare(`
	SELECT *
	FROM agent_runs
	WHERE id = ?
	LIMIT 1
`)

const getActiveRunForConversationStmt = db.prepare(`
	SELECT *
	FROM agent_runs
	WHERE conversation_id = ?
		AND status IN ('queued', 'running', 'waiting_approval', 'recovering')
	ORDER BY created_at DESC
	LIMIT 1
`)

const getRecentFailedRunForConversationStmt = db.prepare(`
	SELECT f.*
	FROM agent_runs f
	WHERE f.conversation_id = ?
		AND f.status = 'failed'
		AND f.updated_at >= COALESCE(
			(SELECT MAX(c.updated_at) FROM agent_runs c
			 WHERE c.conversation_id = f.conversation_id
			   AND c.status = 'completed'),
			'1970-01-01'
		)
	ORDER BY f.updated_at DESC
	LIMIT 1
`)

const upsertRunToolCallStmt = db.prepare(`
	INSERT INTO run_tool_calls (run_id, tool_use_id, tool_name, input_json, output_json, status, error_text, created_at, updated_at, completed_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
	ON CONFLICT(run_id, tool_use_id) DO UPDATE SET
		output_json = excluded.output_json,
		status = excluded.status,
		error_text = excluded.error_text,
		updated_at = CURRENT_TIMESTAMP,
		completed_at = excluded.completed_at
`)

const getRunToolCallStmt = db.prepare(`
	SELECT *
	FROM run_tool_calls
	WHERE run_id = ?
		AND tool_use_id = ?
	LIMIT 1
`)

const listRecoverableRunsStmt = db.prepare(`
	SELECT *
	FROM agent_runs
	WHERE status = 'recovering'
	ORDER BY updated_at ASC
`)

const insertApprovalStmt = db.prepare(`
	INSERT INTO approvals (
		id,
		conversation_id,
		run_id,
		requester_user_id,
		channel_identity_id,
		tool_name,
		tool_input_json,
		reason,
		status,
		requested_at,
		expires_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateApprovalDecisionStmt = db.prepare(`
	UPDATE approvals
	SET status = ?,
		decided_at = ?,
		decided_by_user_id = ?,
		decision_note = ?
	WHERE id = ?
		AND status = 'pending'
`)

const getApprovalByIdStmt = db.prepare(`
	SELECT *
	FROM approvals
	WHERE id = ?
	LIMIT 1
`)

const listPendingApprovalsByConversationStmt = db.prepare(`
	SELECT *
	FROM approvals
	WHERE conversation_id = ?
		AND status = 'pending'
	ORDER BY requested_at ASC
`)

const listPendingApprovalsStmt = db.prepare(`
	SELECT *
	FROM approvals
	WHERE status = 'pending'
	ORDER BY requested_at ASC
`)

const insertAutomationStmt = db.prepare(`
	INSERT INTO automations (
		id,
		owner_user_id,
		channel_identity_id,
		conversation_id,
		name,
		instruction,
		schedule_kind,
		interval_minutes,
		status,
		next_run_at,
		created_at,
		updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateAutomationStmt = db.prepare(`
	UPDATE automations
	SET name = ?,
		instruction = ?,
		interval_minutes = ?,
		status = ?,
		next_run_at = ?,
		last_run_at = ?,
		updated_at = ?
	WHERE id = ?
`)

const getAutomationByIdStmt = db.prepare(`
	SELECT *
	FROM automations
	WHERE id = ?
	LIMIT 1
`)

const listAutomationsByConversationStmt = db.prepare(`
	SELECT *
	FROM automations
	WHERE conversation_id = ?
	ORDER BY created_at DESC
`)

const listAutomationsStmt = db.prepare(`
	SELECT *
	FROM automations
	WHERE status != 'deleted'
	ORDER BY created_at DESC
`)

const listDueAutomationsStmt = db.prepare(`
	SELECT *
	FROM automations
	WHERE status = 'active'
		AND next_run_at <= ?
	ORDER BY next_run_at ASC
	LIMIT ?
`)

const insertAutomationRunStmt = db.prepare(`
	INSERT INTO automation_runs (
		id,
		automation_id,
		conversation_id,
		run_id,
		status,
		error_text,
		created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const completeAutomationRunStmt = db.prepare(`
	UPDATE automation_runs
	SET status = ?,
		error_text = ?,
		completed_at = ?
	WHERE id = ?
`)

const replaceToolPolicyToolsTx = db.transaction((policyId, toolNames) => {
	deleteToolPolicyToolsStmt.run(policyId)
	for (const toolName of toolNames) {
		insertToolPolicyToolStmt.run(policyId, toolName)
	}
})

const ensureRootUserTx = db.transaction(() => {
	const existingRoot = getUserBySystemTypeStmt.get(ROOT_SYSTEM_USER_TYPE)
	const now = nowIso()

	if (existingRoot) {
		db.prepare(`
			UPDATE users
			SET login_name = ?,
				display_name = ?,
				role = 'admin',
				status = 'active',
				auth_source = 'system',
				system_user_type = ?,
				password_hash = NULL,
				password_salt = NULL,
				updated_at = ?
			WHERE id = ?
		`).run(
			ROOT_LOGIN_NAME,
			ROOT_DISPLAY_NAME,
			ROOT_SYSTEM_USER_TYPE,
			now,
			existingRoot.id
		)
		return
	}

	const loginRoot = getUserByLoginNameStmt.get(ROOT_LOGIN_NAME)
	if (loginRoot) {
		db.prepare(`
			UPDATE users
			SET display_name = ?,
				role = 'admin',
				status = 'active',
				auth_source = 'system',
				system_user_type = ?,
				password_hash = NULL,
				password_salt = NULL,
				updated_at = ?
			WHERE id = ?
		`).run(
			ROOT_DISPLAY_NAME,
			ROOT_SYSTEM_USER_TYPE,
			now,
			loginRoot.id
		)
		return
	}

	insertUserStmt.run(
		createId(),
		ROOT_LOGIN_NAME,
		null,
		ROOT_DISPLAY_NAME,
		null,
		null,
		'admin',
		'active',
		'system',
		ROOT_SYSTEM_USER_TYPE,
		now,
		now
	)
})

const insertProtectionRuleStmt = db.prepare(`
	INSERT INTO protection_rules (id, pattern, pattern_type, effect, priority, enabled, scope, note, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(pattern, pattern_type, scope)
	DO UPDATE SET
		effect = excluded.effect,
		priority = excluded.priority,
		enabled = excluded.enabled,
		note = excluded.note,
		updated_at = excluded.updated_at
`)

const getProtectionRulesStmt = db.prepare(`
	SELECT id, pattern, pattern_type AS patternType, effect, priority, enabled, scope, note, created_at AS createdAt, updated_at AS updatedAt
	FROM protection_rules
	ORDER BY enabled DESC, priority ASC, id ASC
`)

const getEnabledProtectionRulesStmt = db.prepare(`
	SELECT id, pattern, pattern_type AS patternType, effect, priority, enabled, scope, note, created_at AS createdAt, updated_at AS updatedAt
	FROM protection_rules
	WHERE enabled = 1
	ORDER BY priority ASC, id ASC
`)

const getProtectionRuleByIdentityStmt = db.prepare(`
	SELECT id, pattern, pattern_type AS patternType, effect, priority, enabled, scope, note, created_at AS createdAt, updated_at AS updatedAt
	FROM protection_rules
	WHERE pattern = ? AND pattern_type = ? AND scope = ?
	LIMIT 1
`)

const setProtectionRuleEnabledStmt = db.prepare(`
	UPDATE protection_rules
	SET enabled = ?,
		updated_at = ?
	WHERE id = ?
`)

const deleteProtectionRuleStmt = db.prepare(`
	DELETE FROM protection_rules
	WHERE id = ?
`)

const insertProtectionAuditLogStmt = db.prepare(`
	INSERT INTO protection_audit_logs (id, session_token, action, target_path, sink, decision, matched_rule_id, reason, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const deleteOldAuditLogsStmt = db.prepare(`
	DELETE FROM protection_audit_logs
	WHERE created_at <= datetime('now', '-90 days')
`)

function ensureProtectionSeeds() {
	const now = nowIso()
	for (const rule of DEFAULT_PROTECTION_RULES) {
		insertProtectionRuleStmt.run(
			createId(),
			rule.pattern,
			rule.patternType,
			rule.effect,
			rule.priority ?? 100,
			1,
			rule.scope ?? 'system',
			rule.note ?? null,
			now,
			now
		)
	}
}

ensureProtectionSeeds()

function ensureSystemToolPolicy(name, description) {
	const now = nowIso()
	let row = getToolPolicyByNameStmt.get(name)
	if (!row) {
		insertToolPolicyStmt.run(createId(), name, description, 1, now, now)
		row = getToolPolicyByNameStmt.get(name)
	} else {
		db.prepare(`
			UPDATE tool_policies
			SET description = ?,
				is_system = 1,
				updated_at = ?
			WHERE id = ?
		`).run(description, now, row.id)
		row = getToolPolicyByIdStmt.get(row.id)
	}
	return mapToolPolicy(row)
}

function ensureSystemFilePolicy(name, description) {
	const now = nowIso()
	let row = getFilePolicyByNameStmt.get(name)
	if (!row) {
		insertFilePolicyStmt.run(createId(), name, description, 1, now, now)
		row = getFilePolicyByNameStmt.get(name)
	} else {
		db.prepare(`
			UPDATE file_policies
			SET description = ?,
				is_system = 1,
				updated_at = ?
			WHERE id = ?
		`).run(description, now, row.id)
		row = getFilePolicyByIdStmt.get(row.id)
	}
	return mapFilePolicy(row)
}

function ensureFilePolicyRootSeed(policyId, scope, rootPath, pathType) {
	const existing = db.prepare(`
		SELECT id
		FROM file_policy_roots
		WHERE policy_id = ?
			AND scope = ?
			AND root_path = ?
			AND path_type = ?
		LIMIT 1
	`).get(policyId, scope, rootPath, pathType)

	if (!existing) {
		insertFilePolicyRootStmt.run(createId(), policyId, scope, rootPath, pathType, nowIso())
	}
}

function bootstrapSystemDefaults() {
	const legacyFullAccess = getToolPolicyByNameStmt.get(LEGACY_FULL_ACCESS_TOOL_POLICY_NAME)
	const defaultNoTools = ensureSystemToolPolicy(
		DEFAULT_TOOL_POLICY_NAME,
		'Built-in default policy that denies all tools.'
	)
	let allToolsPolicy = getToolPolicyByNameStmt.get(SYSTEM_ALL_TOOLS_POLICY_NAME)

	if (legacyFullAccess && !allToolsPolicy) {
		db.prepare(`
			UPDATE tool_policies
			SET name = ?,
				description = ?,
				is_system = 1,
				updated_at = ?
			WHERE id = ?
		`).run(
			SYSTEM_ALL_TOOLS_POLICY_NAME,
			'Built-in system policy that allows every registered tool.',
			nowIso(),
			legacyFullAccess.id
		)
		allToolsPolicy = getToolPolicyByNameStmt.get(SYSTEM_ALL_TOOLS_POLICY_NAME)
	} else if (legacyFullAccess) {
		db.prepare(`
			UPDATE tool_policies
			SET is_system = 1,
				updated_at = ?
			WHERE id = ?
		`).run(nowIso(), legacyFullAccess.id)
	}

	if (!allToolsPolicy) {
		allToolsPolicy = ensureSystemToolPolicy(
			SYSTEM_ALL_TOOLS_POLICY_NAME,
			'Built-in system policy that allows every registered tool.'
		)
	}

	const legacyWorkspaceOnly = getFilePolicyByNameStmt.get(LEGACY_WORKSPACE_FILE_POLICY_NAME)
	let defaultWorkspaceOnly = getFilePolicyByNameStmt.get(DEFAULT_FILE_POLICY_NAME)

	if (legacyWorkspaceOnly && !defaultWorkspaceOnly) {
		db.prepare(`
			UPDATE file_policies
			SET name = ?,
				description = ?,
				is_system = 1,
				updated_at = ?
			WHERE id = ?
		`).run(
			DEFAULT_FILE_POLICY_NAME,
			'Built-in default policy that allows workspace paths only.',
			nowIso(),
			legacyWorkspaceOnly.id
		)
		defaultWorkspaceOnly = getFilePolicyByNameStmt.get(DEFAULT_FILE_POLICY_NAME)
	} else if (legacyWorkspaceOnly) {
		db.prepare(`
			UPDATE file_policies
			SET is_system = 1,
				updated_at = ?
			WHERE id = ?
		`).run(nowIso(), legacyWorkspaceOnly.id)
	}

	if (!defaultWorkspaceOnly) {
		defaultWorkspaceOnly = ensureSystemFilePolicy(
			DEFAULT_FILE_POLICY_NAME,
			'Built-in default policy that allows workspace paths only.'
		)
	}

	ensureFilePolicyRootSeed(defaultWorkspaceOnly.id, 'workspace', '.', 'dir')
	ensureRootUserTx()

	const rootUser = getUserBySystemTypeStmt.get(ROOT_SYSTEM_USER_TYPE)
	const rootBinding = rootUser ? getUserPolicyBindingStmt.get(rootUser.id) : null
	if (rootUser && !rootBinding) {
		upsertUserPolicyBindingStmt.run(
			rootUser.id,
			allToolsPolicy.id,
			defaultWorkspaceOnly.id,
			nowIso()
		)
	}

	if (legacyFullAccess) {
		db.prepare(`
			UPDATE user_policy_bindings
			SET tool_policy_id = ?,
				updated_at = ?
			WHERE tool_policy_id = ?
				AND user_id IN (
					SELECT id
					FROM users
					WHERE COALESCE(system_user_type, '') != ?
				)
		`).run(
			defaultNoTools.id,
			nowIso(),
			legacyFullAccess.id,
			ROOT_SYSTEM_USER_TYPE
		)
	}
}

bootstrapSystemDefaults()

function ensureUserPolicyBinding(userId) {
	const existing = getUserPolicyBindingStmt.get(userId)
	if (existing) {
		return mapUserPolicyBinding(existing)
	}

	const user = getUserByIdStmt.get(userId)
	const defaultToolPolicy = user?.system_user_type === ROOT_SYSTEM_USER_TYPE
		? getToolPolicyByNameStmt.get(SYSTEM_ALL_TOOLS_POLICY_NAME)
		: getToolPolicyByNameStmt.get(DEFAULT_TOOL_POLICY_NAME)
	const defaultFilePolicy = getFilePolicyByNameStmt.get(DEFAULT_FILE_POLICY_NAME)
	if (!defaultToolPolicy || !defaultFilePolicy) {
		return null
	}

	const updatedAt = nowIso()
	upsertUserPolicyBindingStmt.run(
		userId,
		defaultToolPolicy.id,
		defaultFilePolicy.id,
		updatedAt
	)
	return {
		userId,
		toolPolicyId: defaultToolPolicy.id,
		filePolicyId: defaultFilePolicy.id,
		updatedAt
	}
}

export function hasLocalAdminUser() {
	return countLocalAdminsStmt.get().count > 0
}

export function listUsers() {
	return listUsersStmt.all().map(mapUser)
}

export function getUserByEmail(email) {
	return mapUser(getUserByEmailStmt.get(email))
}

export function getUserByLoginName(loginName) {
	return mapUser(getUserByLoginNameStmt.get(loginName))
}

export function getUserById(userId) {
	return mapUser(getUserByIdStmt.get(userId))
}

export function getUserBySystemType(systemUserType) {
	return mapUser(getUserBySystemTypeStmt.get(systemUserType))
}

export function getUserPolicyBinding(userId) {
	return ensureUserPolicyBinding(userId)
}

export function setUserPolicyBinding({
	userId,
	toolPolicyId,
	filePolicyId
}) {
	upsertUserPolicyBindingStmt.run(
		userId,
		toolPolicyId,
		filePolicyId,
		nowIso()
	)
	return getUserPolicyBinding(userId)
}

export function listToolPolicies() {
	return listToolPoliciesStmt.all().map(mapToolPolicy)
}

export function getToolPolicyById(policyId) {
	return mapToolPolicy(getToolPolicyByIdStmt.get(policyId))
}

export function getToolPolicyByName(name) {
	return mapToolPolicy(getToolPolicyByNameStmt.get(name))
}

export function createToolPolicy({
	name,
	description = null,
	isSystem = false
}) {
	const id = createId()
	const now = nowIso()
	insertToolPolicyStmt.run(
		id,
		name,
		description,
		isSystem ? 1 : 0,
		now,
		now
	)
	return getToolPolicyById(id)
}

export function updateToolPolicy({
	id,
	name,
	description
}) {
	updateToolPolicyStmt.run(name, description, nowIso(), id)
	return getToolPolicyById(id)
}

export function deleteToolPolicyRecord(policyId) {
	deleteToolPolicyStmt.run(policyId)
}

export function listToolPolicyTools(policyId) {
	return listToolPolicyToolsStmt.all(policyId).map(row => row.tool_name)
}

export function replaceToolPolicyTools(policyId, toolNames = []) {
	replaceToolPolicyToolsTx(policyId, toolNames)
	return listToolPolicyTools(policyId)
}

export function listFilePolicies() {
	return listFilePoliciesStmt.all().map(mapFilePolicy)
}

export function getFilePolicyById(policyId) {
	return mapFilePolicy(getFilePolicyByIdStmt.get(policyId))
}

export function getFilePolicyByName(name) {
	return mapFilePolicy(getFilePolicyByNameStmt.get(name))
}

export function getDefaultToolPolicy() {
	return getToolPolicyByName(DEFAULT_TOOL_POLICY_NAME)
}

export function getSystemAllToolsPolicy() {
	return getToolPolicyByName(SYSTEM_ALL_TOOLS_POLICY_NAME)
}

export function getDefaultFilePolicy() {
	return getFilePolicyByName(DEFAULT_FILE_POLICY_NAME)
}

export function createFilePolicy({
	name,
	description = null,
	isSystem = false
}) {
	const id = createId()
	const now = nowIso()
	insertFilePolicyStmt.run(
		id,
		name,
		description,
		isSystem ? 1 : 0,
		now,
		now
	)
	return getFilePolicyById(id)
}

export function updateFilePolicy({
	id,
	name,
	description
}) {
	updateFilePolicyStmt.run(name, description, nowIso(), id)
	return getFilePolicyById(id)
}

export function deleteFilePolicyRecord(policyId) {
	deleteFilePolicyStmt.run(policyId)
}

export function listFilePolicyRoots(policyId) {
	return listFilePolicyRootsStmt.all(policyId).map(mapFilePolicyRoot)
}

export function getFilePolicyRootById(rootId) {
	return mapFilePolicyRoot(getFilePolicyRootByIdStmt.get(rootId))
}

export function createFilePolicyRoot({
	policyId,
	scope,
	rootPath,
	pathType
}) {
	const id = createId()
	insertFilePolicyRootStmt.run(id, policyId, scope, rootPath, pathType, nowIso())
	return getFilePolicyRootById(id)
}

export function deleteFilePolicyRootRecord(rootId) {
	deleteFilePolicyRootStmt.run(rootId)
}

export function createUser({
	loginName = null,
	email = null,
	displayName,
	passwordHash = null,
	passwordSalt = null,
	role = 'user',
	status = 'active',
	authSource = 'local',
	systemUserType = null
}) {
	const id = createId()
	const now = nowIso()
	insertUserStmt.run(
		id,
		loginName,
		email,
		displayName,
		passwordHash,
		passwordSalt,
		role,
		status,
		authSource,
		systemUserType,
		now,
		now
	)
	ensureUserPolicyBinding(id)
	return getUserById(id)
}

export function markUserLogin(userId) {
	const now = nowIso()
	updateUserLoginStmt.run(now, now, userId)
	return getUserById(userId)
}

export function updateUserRecord({
	id,
	loginName,
	displayName,
	role,
	status
}) {
	updateUserRecordStmt.run(loginName, displayName, role, status, nowIso(), id)
	return getUserById(id)
}

export function deleteUserRecord(userId) {
	deleteUserStmt.run(userId)
}

export function updateUserPassword({
	userId,
	passwordHash,
	passwordSalt
}) {
	updateUserPasswordStmt.run(passwordHash, passwordSalt, nowIso(), userId)
	return getUserById(userId)
}

export function createAuthSession({
	sessionId = createId(),
	userId,
	csrfToken,
	expiresAt,
	userAgent = null,
	ipHash = null
}) {
	const now = nowIso()
	insertAuthSessionStmt.run(
		sessionId,
		userId,
		csrfToken,
		expiresAt,
		now,
		now,
		userAgent,
		ipHash
	)
	return {
		id: sessionId,
		userId,
		csrfToken,
		expiresAt
	}
}

export function getAuthSession(sessionId) {
	const row = getAuthSessionStmt.get(sessionId)
	if (!row) {
		return null
	}

	return {
		id: row.id,
		userId: row.user_id,
		csrfToken: row.csrf_token,
		expiresAt: row.expires_at,
		createdAt: row.created_at,
		lastSeenAt: row.last_seen_at,
		userAgent: row.user_agent,
		ipHash: row.ip_hash
	}
}

export function touchAuthSession({
	sessionId,
	expiresAt,
	userAgent = null,
	ipHash = null
}) {
	touchAuthSessionStmt.run(nowIso(), expiresAt, userAgent, ipHash, sessionId)
}

export function deleteAuthSession(sessionId) {
	deleteAuthSessionStmt.run(sessionId)
}

export function deleteExpiredAuthSessions(referenceTime = nowIso()) {
	deleteExpiredAuthSessionsStmt.run(referenceTime)
	deleteOldAuditLogsStmt.run()
}

export function deleteSessionsByUserId(userId) {
	deleteSessionsByUserIdStmt.run(userId)
}

export function createPersonalAccessToken({
	userId,
	name,
	tokenHash
}) {
	const id = createId()
	insertPersonalAccessTokenStmt.run(id, userId, name, tokenHash, nowIso())
	return {
		id,
		userId,
		name
	}
}

export function listPersonalAccessTokens(userId) {
	return listPersonalAccessTokensStmt.all(userId).map(row => ({
		id: row.id,
		userId: row.user_id,
		name: row.name,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
		revokedAt: row.revoked_at
	}))
}

export function getPersonalAccessTokenByHash(tokenHash) {
	const row = getPersonalAccessTokenByHashStmt.get(tokenHash)
	if (!row) {
		return null
	}

	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		tokenHash: row.token_hash,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
		revokedAt: row.revoked_at
	}
}

export function markPersonalAccessTokenUsed(tokenId) {
	touchPersonalAccessTokenStmt.run(nowIso(), tokenId)
}

export function revokePersonalAccessToken(tokenId, userId) {
	revokePersonalAccessTokenStmt.run(nowIso(), tokenId, userId)
}

export function getChannelIdentityByKey(identityKey) {
	return mapChannelIdentity(getChannelIdentityByKeyStmt.get(identityKey))
}

export function getChannelIdentityById(channelIdentityId) {
	return mapChannelIdentity(getChannelIdentityByIdStmt.get(channelIdentityId))
}

export function upsertChannelIdentity({
	userId,
	type,
	identityKey,
	displayLabel,
	status = 'active',
	metadata = {}
}) {
	const existing = getChannelIdentityByKey(identityKey)
	const now = nowIso()

	if (!existing) {
		const id = createId()
		insertChannelIdentityStmt.run(
			id,
			userId,
			type,
			identityKey,
			displayLabel,
			status,
			JSON.stringify(metadata),
			now,
			now
		)
		return getChannelIdentityById(id)
	}

	updateChannelIdentityStmt.run(
		displayLabel,
		status,
		JSON.stringify({
			...(existing.metadata || {}),
			...(metadata || {})
		}),
		now,
		existing.id
	)
	return getChannelIdentityById(existing.id)
}

export function createConversation({
	userId,
	channelIdentityId,
	title,
	source,
	externalRef = null
}) {
	const id = createId()
	const now = nowIso()
	insertConversationStmt.run(
		id,
		userId,
		channelIdentityId,
		title,
		'active',
		source,
		externalRef,
		now,
		now,
		null
	)
	return getConversationById(id)
}

export function updateConversation({
	id,
	title,
	status,
	lastMessageAt = null
}) {
	const current = getConversationById(id)
	const now = nowIso()
	updateConversationStmt.run(
		title ?? current.title,
		status ?? current.status,
		now,
		lastMessageAt ?? current.lastMessageAt,
		id
	)
	return getConversationById(id)
}

export function findConversationByExternalRef(channelIdentityId, externalRef) {
	return mapConversation(findConversationByExternalRefStmt.get(channelIdentityId, externalRef))
}

export function getConversationById(conversationId) {
	return mapConversation(getConversationByIdStmt.get(conversationId))
}

export function listConversationsForUser(userId) {
	return listConversationsForUserStmt.all(userId).map(mapConversation)
}

export function createMessage({
	conversationId,
	role,
	authorUserId = null,
	contentText,
	content = null
}) {
	const id = createId()
	const createdAt = nowIso()
	insertMessageStmt.run(
		id,
		conversationId,
		role,
		authorUserId,
		contentText,
		content ? JSON.stringify(content) : null,
		createdAt
	)
	updateConversation({
		id: conversationId,
		lastMessageAt: createdAt
	})
	return getMessageById(id)
}

export function getMessageById(messageId) {
	return mapMessage(getMessageByIdStmt.get(messageId))
}

export function listMessagesByConversation(conversationId) {
	return listMessagesByConversationStmt.all(conversationId).map(mapMessage)
}

export function createConversationEvent({
	conversationId,
	runId = null,
	kind,
	payload
}) {
	const eventId = createId()
	const createdAt = nowIso()
	insertEventStmt.run(
		eventId,
		conversationId,
		runId,
		kind,
		JSON.stringify(payload ?? {}),
		createdAt
	)
	return {
		eventId,
		conversationId,
		runId,
		kind,
		payload,
		createdAt
	}
}

export function listConversationEvents(conversationId, sinceId = 0, limit = 200) {
	return listEventsByConversationStmt.all(conversationId, sinceId, limit).map(row => ({
		id: row.id,
		eventId: row.event_id,
		conversationId: row.conversation_id,
		runId: row.run_id,
		kind: row.kind,
		payload: parseJson(row.payload_json, {}),
		createdAt: row.created_at
	}))
}

export function createAgentRun({
	conversationId,
	triggerType,
	triggerMessageId = null,
	automationId = null,
	providerName,
	phase = 'queued',
	status = 'queued',
	snapshot = null
}) {
	const id = createId()
	const now = nowIso()
	insertRunStmt.run(
		id,
		conversationId,
		status,
		triggerType,
		triggerMessageId,
		automationId,
		providerName,
		phase,
		snapshot ? JSON.stringify(snapshot) : null,
		null,
		now,
		now
	)
	return getAgentRunById(id)
}

export function updateAgentRun({
	id,
	status,
	phase,
	snapshot = null,
	lastError = null,
	completedAt = null
}) {
	updateRunStmt.run(
		status,
		phase,
		snapshot ? JSON.stringify(snapshot) : null,
		lastError,
		nowIso(),
		completedAt,
		id
	)
	return getAgentRunById(id)
}

export function getAgentRunById(runId) {
	return mapRun(getRunByIdStmt.get(runId))
}

export function getActiveRunForConversation(conversationId) {
	return mapRun(getActiveRunForConversationStmt.get(conversationId))
}

export function getRecentFailedRunForConversation(conversationId) {
	return mapRun(getRecentFailedRunForConversationStmt.get(conversationId))
}

export function saveRunToolCall({
	runId,
	toolUseId,
	toolName,
	inputJson = null,
	outputJson = null,
	status,
	errorText = null,
	completedAt = null
}) {
	upsertRunToolCallStmt.run(
		runId,
		toolUseId,
		toolName,
		inputJson,
		outputJson,
		status,
		errorText,
		completedAt
	)
}

export function getRunToolCall(runId, toolUseId) {
	const row = getRunToolCallStmt.get(runId, toolUseId)
	if (!row) return null
	return {
		id: row.id,
		runId: row.run_id,
		toolUseId: row.tool_use_id,
		toolName: row.tool_name,
		inputJson: row.input_json,
		outputJson: row.output_json,
		status: row.status,
		errorText: row.error_text,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		completedAt: row.completed_at
	}
}

export function listAllRecoverableRuns() {
	return listRecoverableRunsStmt.all().map(mapRun)
}

export function createApproval({
	conversationId,
	runId,
	requesterUserId,
	channelIdentityId,
	toolName,
	toolInput,
	reason,
	expiresAt = null
}) {
	const id = createId()
	insertApprovalStmt.run(
		id,
		conversationId,
		runId,
		requesterUserId,
		channelIdentityId,
		toolName,
		JSON.stringify(toolInput ?? {}),
		reason,
		'pending',
		nowIso(),
		expiresAt
	)
	return getApprovalById(id)
}

export function getApprovalById(approvalId) {
	return mapApproval(getApprovalByIdStmt.get(approvalId))
}

export function listPendingApprovalsByConversation(conversationId) {
	return listPendingApprovalsByConversationStmt.all(conversationId).map(mapApproval)
}

export function listPendingApprovals() {
	return listPendingApprovalsStmt.all().map(mapApproval)
}

export function decideApproval({
	approvalId,
	status,
	decidedByUserId,
	decisionNote = null
}) {
	const decidedAt = nowIso()
	const result = updateApprovalDecisionStmt.run(
		status,
		decidedAt,
		decidedByUserId,
		decisionNote,
		approvalId
	)

	if (result.changes === 0) {
		return null
	}

	return getApprovalById(approvalId)
}

export function createAutomation({
	ownerUserId,
	channelIdentityId,
	conversationId,
	name,
	instruction,
	scheduleKind = 'interval',
	intervalMinutes,
	nextRunAt
}) {
	const id = createId()
	const now = nowIso()
	insertAutomationStmt.run(
		id,
		ownerUserId,
		channelIdentityId,
		conversationId,
		name,
		instruction,
		scheduleKind,
		intervalMinutes,
		'active',
		nextRunAt,
		now,
		now
	)
	return getAutomationById(id)
}

export function updateAutomation({
	id,
	name,
	instruction,
	intervalMinutes,
	status,
	nextRunAt,
	lastRunAt = null
}) {
	const current = getAutomationById(id)
	updateAutomationStmt.run(
		name ?? current.name,
		instruction ?? current.instruction,
		intervalMinutes ?? current.intervalMinutes,
		status ?? current.status,
		nextRunAt ?? current.nextRunAt,
		lastRunAt ?? current.lastRunAt,
		nowIso(),
		id
	)
	return getAutomationById(id)
}

export function getAutomationById(automationId) {
	return mapAutomation(getAutomationByIdStmt.get(automationId))
}

export function listAutomationsByConversation(conversationId) {
	return listAutomationsByConversationStmt.all(conversationId).map(mapAutomation)
}

export function listAutomations() {
	return listAutomationsStmt.all().map(mapAutomation)
}

export function listDueAutomations(limit = 20, referenceTime = nowIso()) {
	return listDueAutomationsStmt.all(referenceTime, limit).map(mapAutomation)
}

export function createAutomationRun({
	automationId,
	conversationId,
	runId = null,
	status = 'started',
	errorText = null
}) {
	const id = createId()
	insertAutomationRunStmt.run(
		id,
		automationId,
		conversationId,
		runId,
		status,
		errorText,
		nowIso()
	)
	return {
		id,
		automationId,
		conversationId,
		runId,
		status,
		errorText
	}
}

export function completeAutomationRun({
	automationRunId,
	status,
	errorText = null
}) {
	completeAutomationRunStmt.run(status, errorText, nowIso(), automationRunId)
}

export function getOrCreateRemoteUser({
	type,
	identityKey,
	displayLabel,
	metadata = {}
}) {
	const existingIdentity = getChannelIdentityByKey(identityKey)
	if (existingIdentity) {
		return {
			user: getUserById(existingIdentity.userId),
			channelIdentity: upsertChannelIdentity({
				userId: existingIdentity.userId,
				type,
				identityKey,
				displayLabel,
				metadata
			})
		}
	}

	const user = createUser({
		email: null,
		displayName: displayLabel,
		role: 'user',
		authSource: type
	})
	const channelIdentity = upsertChannelIdentity({
		userId: user.id,
		type,
		identityKey,
		displayLabel,
		metadata
	})
	return { user, channelIdentity }
}

export function ensureWebChannelIdentity(userId, displayLabel) {
	return upsertChannelIdentity({
		userId,
		type: 'web',
		identityKey: `web:${userId}`,
		displayLabel,
		metadata: {}
	})
}

export function getProtectionRules(options = {}) {
	if (options.enabledOnly) {
		return getEnabledProtectionRulesStmt.all().map(row => ({
			...row,
			enabled: Boolean(row.enabled)
		}))
	}

	return getProtectionRulesStmt.all().map(row => ({
		...row,
		enabled: Boolean(row.enabled)
	}))
}

export function createProtectionRule(rule) {
	const now = nowIso()
	const id = createId()
	insertProtectionRuleStmt.run(
		id,
		rule.pattern,
		rule.patternType,
		rule.effect,
		rule.priority ?? 100,
		rule.enabled === false ? 0 : 1,
		rule.scope ?? 'workspace',
		rule.note ?? null,
		now,
		now
	)

	return getProtectionRuleByIdentityStmt.get(
		rule.pattern,
		rule.patternType,
		rule.scope ?? 'workspace'
	)
}

export function setProtectionRuleEnabled(ruleId, enabled) {
	setProtectionRuleEnabledStmt.run(enabled ? 1 : 0, nowIso(), ruleId)
}

export function deleteProtectionRule(ruleId) {
	deleteProtectionRuleStmt.run(ruleId)
}

export function saveProtectionAuditLog(entry) {
	insertProtectionAuditLogStmt.run(
		createId(),
		entry.sessionToken ?? null,
		entry.action,
		entry.targetPath ?? null,
		entry.sink ?? null,
		entry.decision,
		entry.matchedRuleId ?? null,
		entry.reason ?? null,
		nowIso()
	)
}

export default db
