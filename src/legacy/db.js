import Database from 'better-sqlite3'
import {
	redactSensitiveText,
	redactSensitiveValue
} from '../protection/classifier.js'
import { DEFAULT_PROTECTION_RULES } from '../protection/defaultRules.js'
import {
	DEFAULT_FILE_POLICY_NAME,
	DEFAULT_TOOL_POLICY_NAME,
	getSystemFilePolicySeeds,
	getSystemToolPolicySeeds,
	LOCAL_OPERATOR_ACCOUNT_ID,
	SYSTEM_ALL_TOOLS_POLICY_NAME
} from './policyDefaults.js'

const db = new Database('app.db')

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
	CREATE TABLE IF NOT EXISTS sessions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_key TEXT NOT NULL,
		session_token TEXT NOT NULL UNIQUE,
		status TEXT NOT NULL DEFAULT 'active',
		operator_account_id TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		ended_at TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_sessions_session_key
	ON sessions(session_key);

	CREATE TABLE IF NOT EXISTS messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_token TEXT NOT NULL,
		role TEXT NOT NULL,
		content TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_messages_session_token
	ON messages(session_token);

	CREATE TABLE IF NOT EXISTS conversation_state (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_token TEXT NOT NULL,
		state_key TEXT NOT NULL,
		state_value TEXT NOT NULL,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(session_token, state_key)
	);

	CREATE TABLE IF NOT EXISTS tool_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_token TEXT NOT NULL,
		tool_name TEXT NOT NULL,
		input_json TEXT,
		output_json TEXT,
		status TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS summaries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_token TEXT NOT NULL,
		summary_text TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS agent_runs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		run_id TEXT NOT NULL UNIQUE,
		session_token TEXT NOT NULL,
		status TEXT NOT NULL,
		phase TEXT NOT NULL,
		attempt_count INTEGER NOT NULL DEFAULT 0,
		last_error TEXT,
		snapshot_json TEXT,
		final_output TEXT,
		principal_account_id TEXT,
		auth_revision_snapshot INTEGER NOT NULL DEFAULT 0,
		stop_reason TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		completed_at TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_agent_runs_session_token
	ON agent_runs(session_token, status);

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

	CREATE INDEX IF NOT EXISTS idx_run_tool_calls_run_id
	ON run_tool_calls(run_id, status);

	CREATE TABLE IF NOT EXISTS protection_rules (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
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
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_token TEXT,
		action TEXT NOT NULL,
		target_path TEXT,
		sink TEXT,
		decision TEXT NOT NULL,
		matched_rule_id INTEGER,
		reason TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS accounts (
		id TEXT PRIMARY KEY,
		display_name TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'active',
		is_admin INTEGER NOT NULL DEFAULT 0,
		auth_revision INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS tool_policies (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		description TEXT,
		is_system INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS tool_policy_tools (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		tool_policy_id INTEGER NOT NULL,
		tool_name TEXT NOT NULL,
		UNIQUE(tool_policy_id, tool_name)
	);

	CREATE TABLE IF NOT EXISTS file_policies (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		description TEXT,
		is_system INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS file_policy_roots (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		file_policy_id INTEGER NOT NULL,
		absolute_path TEXT NOT NULL,
		path_type TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(file_policy_id, absolute_path, path_type)
	);

	CREATE TABLE IF NOT EXISTS account_policy_bindings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		account_id TEXT NOT NULL UNIQUE,
		tool_policy_id INTEGER NOT NULL,
		file_policy_id INTEGER NOT NULL,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
`)

const insertSessionStmt = db.prepare(`
	INSERT INTO sessions (session_key, session_token, status, operator_account_id)
	VALUES (?, ?, 'active', ?)
`)

const endSessionStmt = db.prepare(`
	UPDATE sessions
	SET status = 'archived',
		ended_at = CURRENT_TIMESTAMP
	WHERE session_token = ?
`)

const getActiveSessionStmt = db.prepare(`
	SELECT *
	FROM sessions
	WHERE session_key = ? AND status = 'active'
	ORDER BY id DESC
	LIMIT 1
`)

const getSessionByTokenStmt = db.prepare(`
	SELECT *
	FROM sessions
	WHERE session_token = ?
	LIMIT 1
`)

const insertMessageStmt = db.prepare(`
	INSERT INTO messages (session_token, role, content)
	VALUES (?, ?, ?)
`)

const getMessagesStmt = db.prepare(`
	SELECT role, content, created_at
	FROM messages
	WHERE session_token = ?
	ORDER BY id ASC
`)

const getRawMessagesStmt = db.prepare(`
	SELECT id, role, content, created_at
	FROM messages
	WHERE session_token = ?
	ORDER BY id ASC
`)

const insertToolLogStmt = db.prepare(`
	INSERT INTO tool_logs (session_token, tool_name, input_json, output_json, status)
	VALUES (?, ?, ?, ?, ?)
`)

const insertSummaryStmt = db.prepare(`
	INSERT INTO summaries (session_token, summary_text)
	VALUES (?, ?)
`)

const upsertConversationStateStmt = db.prepare(`
	INSERT INTO conversation_state (session_token, state_key, state_value)
	VALUES (?, ?, ?)
	ON CONFLICT(session_token, state_key)
	DO UPDATE SET
		state_value = excluded.state_value,
		updated_at = CURRENT_TIMESTAMP
`)

const getConversationStateStmt = db.prepare(`
	SELECT state_value
	FROM conversation_state
	WHERE session_token = ? AND state_key = ?
	LIMIT 1
`)

const deleteConversationStateStmt = db.prepare(`
	DELETE FROM conversation_state
	WHERE session_token = ? AND state_key = ?
`)

const insertAgentRunStmt = db.prepare(`
	INSERT INTO agent_runs (
		run_id,
		session_token,
		status,
		phase,
		attempt_count,
		last_error,
		snapshot_json,
		final_output,
		principal_account_id,
		auth_revision_snapshot,
		stop_reason
	)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateAgentRunStmt = db.prepare(`
	UPDATE agent_runs
	SET status = @status,
		phase = @phase,
		attempt_count = @attemptCount,
		last_error = @lastError,
		snapshot_json = @snapshotJson,
		final_output = @finalOutput,
		principal_account_id = @principalAccountId,
		auth_revision_snapshot = @authRevisionSnapshot,
		stop_reason = @stopReason,
		updated_at = CURRENT_TIMESTAMP,
		completed_at = CASE
			WHEN @status IN ('completed', 'failed', 'cancelled') THEN CURRENT_TIMESTAMP
			ELSE NULL
		END
	WHERE run_id = @runId
`)

const getAgentRunStmt = db.prepare(`
	SELECT *
	FROM agent_runs
	WHERE run_id = ?
	LIMIT 1
`)

const getLatestPendingRunForSessionStmt = db.prepare(`
	SELECT *
	FROM agent_runs
	WHERE session_token = ?
		AND status IN ('queued', 'api_inflight', 'tool_inflight', 'recovering', 'waiting_human')
	ORDER BY id DESC
	LIMIT 1
`)

const getLatestRunForSessionStmt = db.prepare(`
	SELECT *
	FROM agent_runs
	WHERE session_token = ?
	ORDER BY id DESC
	LIMIT 1
`)

const listRecoverableRunsStmt = db.prepare(`
	SELECT *
	FROM agent_runs
	WHERE status IN ('queued', 'api_inflight', 'tool_inflight', 'recovering', 'waiting_human')
	ORDER BY id ASC
`)

const upsertRunToolCallStmt = db.prepare(`
	INSERT INTO run_tool_calls (
		run_id,
		tool_use_id,
		tool_name,
		input_json,
		output_json,
		status,
		error_text,
		completed_at
	)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(run_id, tool_use_id)
	DO UPDATE SET
		tool_name = excluded.tool_name,
		input_json = excluded.input_json,
		output_json = excluded.output_json,
		status = excluded.status,
		error_text = excluded.error_text,
		completed_at = excluded.completed_at,
		updated_at = CURRENT_TIMESTAMP
`)

const getRunToolCallStmt = db.prepare(`
	SELECT *
	FROM run_tool_calls
	WHERE run_id = ? AND tool_use_id = ?
	LIMIT 1
`)

const insertProtectionRuleStmt = db.prepare(`
	INSERT INTO protection_rules (pattern, pattern_type, effect, priority, enabled, scope, note)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(pattern, pattern_type, scope)
	DO UPDATE SET
		effect = excluded.effect,
		priority = excluded.priority,
		enabled = excluded.enabled,
		note = excluded.note,
		updated_at = CURRENT_TIMESTAMP
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
		updated_at = CURRENT_TIMESTAMP
	WHERE id = ?
`)

const deleteProtectionRuleStmt = db.prepare(`
	DELETE FROM protection_rules
	WHERE id = ?
`)

const insertProtectionAuditLogStmt = db.prepare(`
	INSERT INTO protection_audit_logs (session_token, action, target_path, sink, decision, matched_rule_id, reason)
	VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const upsertAccountStmt = db.prepare(`
	INSERT INTO accounts (id, display_name, status, is_admin, auth_revision)
	VALUES (@id, @displayName, @status, @isAdmin, @authRevision)
	ON CONFLICT(id)
	DO UPDATE SET
		display_name = excluded.display_name,
		status = excluded.status,
		is_admin = excluded.is_admin,
		auth_revision = CASE
			WHEN accounts.auth_revision > excluded.auth_revision THEN accounts.auth_revision
			ELSE excluded.auth_revision
		END,
		updated_at = CURRENT_TIMESTAMP
`)

const getAccountByIdStmt = db.prepare(`
	SELECT id, display_name AS displayName, status, is_admin AS isAdmin, auth_revision AS authRevision, created_at AS createdAt, updated_at AS updatedAt
	FROM accounts
	WHERE id = ?
	LIMIT 1
`)

const getAllAccountsStmt = db.prepare(`
	SELECT id, display_name AS displayName, status, is_admin AS isAdmin, auth_revision AS authRevision, created_at AS createdAt, updated_at AS updatedAt
	FROM accounts
	ORDER BY id ASC
`)

const insertAccountStmt = db.prepare(`
	INSERT INTO accounts (id, display_name, status, is_admin, auth_revision)
	VALUES (?, ?, ?, ?, ?)
`)

const updateAccountStmt = db.prepare(`
	UPDATE accounts
	SET display_name = ?,
		status = ?,
		is_admin = ?,
		updated_at = CURRENT_TIMESTAMP
	WHERE id = ?
`)

const bumpAccountAuthRevisionStmt = db.prepare(`
	UPDATE accounts
	SET auth_revision = auth_revision + 1,
		updated_at = CURRENT_TIMESTAMP
	WHERE id = ?
`)

const insertToolPolicyStmt = db.prepare(`
	INSERT INTO tool_policies (name, description, is_system)
	VALUES (?, ?, ?)
`)

const updateToolPolicyStmt = db.prepare(`
	UPDATE tool_policies
	SET name = ?,
		description = ?,
		updated_at = CURRENT_TIMESTAMP
	WHERE id = ?
`)

const getToolPolicyByIdStmt = db.prepare(`
	SELECT id, name, description, is_system AS isSystem, created_at AS createdAt, updated_at AS updatedAt
	FROM tool_policies
	WHERE id = ?
	LIMIT 1
`)

const getToolPolicyByNameStmt = db.prepare(`
	SELECT id, name, description, is_system AS isSystem, created_at AS createdAt, updated_at AS updatedAt
	FROM tool_policies
	WHERE name = ?
	LIMIT 1
`)

const listToolPoliciesStmt = db.prepare(`
	SELECT id, name, description, is_system AS isSystem, created_at AS createdAt, updated_at AS updatedAt
	FROM tool_policies
	ORDER BY is_system DESC, name ASC
`)

const deleteToolPolicyStmt = db.prepare(`
	DELETE FROM tool_policies
	WHERE id = ?
`)

const insertToolPolicyToolStmt = db.prepare(`
	INSERT OR IGNORE INTO tool_policy_tools (tool_policy_id, tool_name)
	VALUES (?, ?)
`)

const deleteToolPolicyToolsStmt = db.prepare(`
	DELETE FROM tool_policy_tools
	WHERE tool_policy_id = ?
`)

const listToolPolicyToolsStmt = db.prepare(`
	SELECT tool_name AS toolName
	FROM tool_policy_tools
	WHERE tool_policy_id = ?
	ORDER BY tool_name ASC
`)

const insertFilePolicyStmt = db.prepare(`
	INSERT INTO file_policies (name, description, is_system)
	VALUES (?, ?, ?)
`)

const updateFilePolicyStmt = db.prepare(`
	UPDATE file_policies
	SET name = ?,
		description = ?,
		updated_at = CURRENT_TIMESTAMP
	WHERE id = ?
`)

const getFilePolicyByIdStmt = db.prepare(`
	SELECT id, name, description, is_system AS isSystem, created_at AS createdAt, updated_at AS updatedAt
	FROM file_policies
	WHERE id = ?
	LIMIT 1
`)

const getFilePolicyByNameStmt = db.prepare(`
	SELECT id, name, description, is_system AS isSystem, created_at AS createdAt, updated_at AS updatedAt
	FROM file_policies
	WHERE name = ?
	LIMIT 1
`)

const listFilePoliciesStmt = db.prepare(`
	SELECT id, name, description, is_system AS isSystem, created_at AS createdAt, updated_at AS updatedAt
	FROM file_policies
	ORDER BY is_system DESC, name ASC
`)

const deleteFilePolicyStmt = db.prepare(`
	DELETE FROM file_policies
	WHERE id = ?
`)

const insertFilePolicyRootStmt = db.prepare(`
	INSERT OR IGNORE INTO file_policy_roots (file_policy_id, absolute_path, path_type)
	VALUES (?, ?, ?)
`)

const deleteFilePolicyRootStmt = db.prepare(`
	DELETE FROM file_policy_roots
	WHERE id = ?
`)

const deleteRootsByFilePolicyIdStmt = db.prepare(`
	DELETE FROM file_policy_roots
	WHERE file_policy_id = ?
`)

const listFilePolicyRootsStmt = db.prepare(`
	SELECT id, file_policy_id AS filePolicyId, absolute_path AS absolutePath, path_type AS pathType, created_at AS createdAt
	FROM file_policy_roots
	WHERE file_policy_id = ?
	ORDER BY path_type ASC, absolute_path ASC
`)

const getFilePolicyRootByIdStmt = db.prepare(`
	SELECT id, file_policy_id AS filePolicyId, absolute_path AS absolutePath, path_type AS pathType, created_at AS createdAt
	FROM file_policy_roots
	WHERE id = ?
	LIMIT 1
`)

const getAccountPolicyBindingByAccountIdStmt = db.prepare(`
	SELECT id, account_id AS accountId, tool_policy_id AS toolPolicyId, file_policy_id AS filePolicyId, updated_at AS updatedAt
	FROM account_policy_bindings
	WHERE account_id = ?
	LIMIT 1
`)

const upsertAccountPolicyBindingStmt = db.prepare(`
	INSERT INTO account_policy_bindings (account_id, tool_policy_id, file_policy_id)
	VALUES (?, ?, ?)
	ON CONFLICT(account_id)
	DO UPDATE SET
		tool_policy_id = excluded.tool_policy_id,
		file_policy_id = excluded.file_policy_id,
		updated_at = CURRENT_TIMESTAMP
`)

const listAccountsByToolPolicyIdStmt = db.prepare(`
	SELECT a.id, a.display_name AS displayName, a.status, a.is_admin AS isAdmin, a.auth_revision AS authRevision, a.created_at AS createdAt, a.updated_at AS updatedAt
	FROM accounts a
	INNER JOIN account_policy_bindings apb ON apb.account_id = a.id
	WHERE apb.tool_policy_id = ?
	ORDER BY a.id ASC
`)

const listAccountsByFilePolicyIdStmt = db.prepare(`
	SELECT a.id, a.display_name AS displayName, a.status, a.is_admin AS isAdmin, a.auth_revision AS authRevision, a.created_at AS createdAt, a.updated_at AS updatedAt
	FROM accounts a
	INNER JOIN account_policy_bindings apb ON apb.account_id = a.id
	WHERE apb.file_policy_id = ?
	ORDER BY a.id ASC
`)

const reassignToolPolicyStmt = db.prepare(`
	UPDATE account_policy_bindings
	SET tool_policy_id = ?,
		updated_at = CURRENT_TIMESTAMP
	WHERE tool_policy_id = ?
`)

const reassignFilePolicyStmt = db.prepare(`
	UPDATE account_policy_bindings
	SET file_policy_id = ?,
		updated_at = CURRENT_TIMESTAMP
	WHERE file_policy_id = ?
`)

function parseRunRow(row) {
	if (!row) {
		return null
	}

	return {
		...row,
		snapshot: row.snapshot_json ? JSON.parse(row.snapshot_json) : null
	}
}

function parseAccountRow(row) {
	if (!row) {
		return null
	}

	return {
		...row,
		isAdmin: Boolean(row.isAdmin)
	}
}

function ensureProtectionSeeds() {
	for (const rule of DEFAULT_PROTECTION_RULES) {
		insertProtectionRuleStmt.run(
			rule.pattern,
			rule.patternType,
			rule.effect,
			rule.priority ?? 100,
			1,
			rule.scope ?? 'system',
			rule.note ?? null
		)
	}
}

function ensureToolPolicySeed(definition) {
	let policy = getToolPolicyByNameStmt.get(definition.name)

	if (!policy) {
		insertToolPolicyStmt.run(
			definition.name,
			definition.description ?? null,
			definition.isSystem ? 1 : 0
		)
		policy = getToolPolicyByNameStmt.get(definition.name)
	}

	deleteToolPolicyToolsStmt.run(policy.id)
	for (const toolName of definition.tools || []) {
		insertToolPolicyToolStmt.run(policy.id, toolName)
	}

	return getToolPolicyById(policy.id)
}

function ensureFilePolicySeed(definition) {
	let policy = getFilePolicyByNameStmt.get(definition.name)

	if (!policy) {
		insertFilePolicyStmt.run(
			definition.name,
			definition.description ?? null,
			definition.isSystem ? 1 : 0
		)
		policy = getFilePolicyByNameStmt.get(definition.name)
	}

	return getFilePolicyById(policy.id)
}

function ensureBootstrapData() {
	upsertAccountStmt.run({
		id: LOCAL_OPERATOR_ACCOUNT_ID,
		displayName: 'Local Operator',
		status: 'active',
		isAdmin: 1,
		authRevision: 1
	})

	for (const definition of getSystemToolPolicySeeds()) {
		ensureToolPolicySeed(definition)
	}

	for (const definition of getSystemFilePolicySeeds()) {
		ensureFilePolicySeed(definition)
	}

	const toolPolicy = getToolPolicyByName(DEFAULT_TOOL_POLICY_NAME)
	const filePolicy = getFilePolicyByName(DEFAULT_FILE_POLICY_NAME)
	const localOperatorToolPolicy = getToolPolicyByName(SYSTEM_ALL_TOOLS_POLICY_NAME)

	const existingBinding = getAccountPolicyBindingByAccountId(LOCAL_OPERATOR_ACCOUNT_ID)
	if (!existingBinding) {
		upsertAccountPolicyBindingStmt.run(
			LOCAL_OPERATOR_ACCOUNT_ID,
			localOperatorToolPolicy?.id || toolPolicy.id,
			filePolicy.id
		)
	}

	db.prepare(`
		UPDATE sessions
		SET operator_account_id = COALESCE(operator_account_id, ?)
	`).run(LOCAL_OPERATOR_ACCOUNT_ID)
}

ensureProtectionSeeds()
ensureBootstrapData()

export function createSession(sessionKey, sessionToken, operatorAccountId = LOCAL_OPERATOR_ACCOUNT_ID) {
	insertSessionStmt.run(sessionKey, sessionToken, operatorAccountId)
}

export function endSession(sessionToken) {
	endSessionStmt.run(sessionToken)
}

export function getActiveSession(sessionKey) {
	return getActiveSessionStmt.get(sessionKey)
}

export function getSessionByToken(sessionToken) {
	return getSessionByTokenStmt.get(sessionToken)
}

export function saveMessage(sessionToken, role, content) {
	insertMessageStmt.run(sessionToken, role, redactSensitiveText(content))
}

export function getMessages(sessionToken) {
	return getMessagesStmt.all(sessionToken)
}

export function getRawMessages(sessionToken) {
	return getRawMessagesStmt.all(sessionToken)
}

export function saveToolLog(sessionToken, toolName, input, output, status) {
	insertToolLogStmt.run(
		sessionToken,
		toolName,
		JSON.stringify(redactSensitiveValue(input ?? null)),
		JSON.stringify(redactSensitiveValue(output ?? null)),
		status
	)
}

export function saveSummary(sessionToken, summaryText) {
	insertSummaryStmt.run(sessionToken, redactSensitiveText(summaryText))
}

export function saveConversationState(sessionToken, key, value) {
	upsertConversationStateStmt.run(sessionToken, key, JSON.stringify(value))
}

export function getConversationState(sessionToken, key) {
	const row = getConversationStateStmt.get(sessionToken, key)
	return row ? JSON.parse(row.state_value) : null
}

export function deleteConversationState(sessionToken, key) {
	deleteConversationStateStmt.run(sessionToken, key)
}

export function createAgentRun(run) {
	insertAgentRunStmt.run(
		run.runId,
		run.sessionToken,
		run.status,
		run.phase,
		run.attemptCount ?? 0,
		run.lastError ?? null,
		JSON.stringify(redactSensitiveValue(run.snapshot ?? null)),
		run.finalOutput ?? null,
		run.principalAccountId ?? LOCAL_OPERATOR_ACCOUNT_ID,
		run.authRevisionSnapshot ?? 0,
		run.stopReason ?? null
	)

	return getAgentRun(run.runId)
}

export function updateAgentRun(run) {
	updateAgentRunStmt.run({
		runId: run.runId,
		status: run.status,
		phase: run.phase,
		attemptCount: run.attemptCount ?? 0,
		lastError: run.lastError ?? null,
		snapshotJson: JSON.stringify(redactSensitiveValue(run.snapshot ?? null)),
		finalOutput: run.finalOutput ?? null,
		principalAccountId: run.principalAccountId ?? LOCAL_OPERATOR_ACCOUNT_ID,
		authRevisionSnapshot: run.authRevisionSnapshot ?? 0,
		stopReason: run.stopReason ?? null
	})

	return getAgentRun(run.runId)
}

export function getAgentRun(runId) {
	return parseRunRow(getAgentRunStmt.get(runId))
}

export function getLatestPendingRunForSession(sessionToken) {
	return parseRunRow(getLatestPendingRunForSessionStmt.get(sessionToken))
}

export function getLatestRunForSession(sessionToken) {
	return parseRunRow(getLatestRunForSessionStmt.get(sessionToken))
}

export function listRecoverableRuns() {
	return listRecoverableRunsStmt.all().map(parseRunRow)
}

export function saveRunToolCall({
	runId,
	toolUseId,
	toolName,
	input,
	output,
	status,
	errorText = null,
	completedAt = null
}) {
	upsertRunToolCallStmt.run(
		runId,
		toolUseId,
		toolName,
		JSON.stringify(redactSensitiveValue(input ?? null)),
		JSON.stringify(redactSensitiveValue(output ?? null)),
		status,
		errorText,
		completedAt
	)
}

export function getRunToolCall(runId, toolUseId) {
	const row = getRunToolCallStmt.get(runId, toolUseId)

	if (!row) {
		return null
	}

	return {
		...row,
		input: row.input_json ? JSON.parse(row.input_json) : null,
		output: row.output_json ? JSON.parse(row.output_json) : null
	}
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
	insertProtectionRuleStmt.run(
		rule.pattern,
		rule.patternType,
		rule.effect,
		rule.priority ?? 100,
		rule.enabled === false ? 0 : 1,
		rule.scope ?? 'workspace',
		rule.note ?? null
	)

	return getProtectionRuleByIdentityStmt.get(
		rule.pattern,
		rule.patternType,
		rule.scope ?? 'workspace'
	)
}

export function setProtectionRuleEnabled(ruleId, enabled) {
	setProtectionRuleEnabledStmt.run(enabled ? 1 : 0, ruleId)
}

export function deleteProtectionRule(ruleId) {
	deleteProtectionRuleStmt.run(ruleId)
}

export function saveProtectionAuditLog(entry) {
	insertProtectionAuditLogStmt.run(
		entry.sessionToken ?? null,
		entry.action,
		entry.targetPath ?? null,
		entry.sink ?? null,
		entry.decision,
		entry.matchedRuleId ?? null,
		entry.reason ?? null
	)
}

export function getAccountById(accountId) {
	return parseAccountRow(getAccountByIdStmt.get(accountId))
}

export function getAllAccounts() {
	return getAllAccountsStmt.all().map(parseAccountRow)
}

export function createAccount(account) {
	insertAccountStmt.run(
		account.id,
		account.displayName,
		account.status ?? 'active',
		account.isAdmin ? 1 : 0,
		account.authRevision ?? 1
	)

	return getAccountById(account.id)
}

export function updateAccount(account) {
	updateAccountStmt.run(
		account.displayName,
		account.status,
		account.isAdmin ? 1 : 0,
		account.id
	)

	return getAccountById(account.id)
}

export function touchAccountAuthRevision(accountId) {
	bumpAccountAuthRevisionStmt.run(accountId)
	return getAccountById(accountId)
}

export function getToolPolicyById(policyId) {
	return getToolPolicyByIdStmt.get(policyId) || null
}

export function getToolPolicyByName(policyName) {
	return getToolPolicyByNameStmt.get(policyName) || null
}

export function listToolPolicies() {
	return listToolPoliciesStmt.all()
}

export function createToolPolicy({
	name,
	description = null,
	isSystem = false
}) {
	insertToolPolicyStmt.run(name, description, isSystem ? 1 : 0)
	return getToolPolicyByName(name)
}

export function updateToolPolicy({
	id,
	name,
	description = null
}) {
	updateToolPolicyStmt.run(name, description, id)
	return getToolPolicyById(id)
}

export function deleteToolPolicy(policyId) {
	deleteToolPolicyToolsStmt.run(policyId)
	deleteToolPolicyStmt.run(policyId)
}

export function listToolPolicyTools(policyId) {
	return listToolPolicyToolsStmt.all(policyId).map(row => row.toolName)
}

export function replaceToolPolicyTools(policyId, toolNames) {
	const normalized = Array.from(new Set(toolNames.map(toolName => String(toolName).trim()).filter(Boolean)))

	const transaction = db.transaction(() => {
		deleteToolPolicyToolsStmt.run(policyId)
		for (const toolName of normalized) {
			insertToolPolicyToolStmt.run(policyId, toolName)
		}
	})

	transaction()
	return listToolPolicyTools(policyId)
}

export function getFilePolicyById(policyId) {
	return getFilePolicyByIdStmt.get(policyId) || null
}

export function getFilePolicyByName(policyName) {
	return getFilePolicyByNameStmt.get(policyName) || null
}

export function listFilePolicies() {
	return listFilePoliciesStmt.all()
}

export function createFilePolicy({
	name,
	description = null,
	isSystem = false
}) {
	insertFilePolicyStmt.run(name, description, isSystem ? 1 : 0)
	return getFilePolicyByName(name)
}

export function updateFilePolicy({
	id,
	name,
	description = null
}) {
	updateFilePolicyStmt.run(name, description, id)
	return getFilePolicyById(id)
}

export function deleteFilePolicy(policyId) {
	deleteRootsByFilePolicyIdStmt.run(policyId)
	deleteFilePolicyStmt.run(policyId)
}

export function listFilePolicyRoots(policyId) {
	return listFilePolicyRootsStmt.all(policyId)
}

export function addFilePolicyRoot({
	filePolicyId,
	absolutePath,
	pathType
}) {
	insertFilePolicyRootStmt.run(filePolicyId, absolutePath, pathType)
	return listFilePolicyRoots(filePolicyId)
}

export function getFilePolicyRootById(rootId) {
	return getFilePolicyRootByIdStmt.get(rootId) || null
}

export function deleteFilePolicyRoot(rootId) {
	deleteFilePolicyRootStmt.run(rootId)
}

export function getAccountPolicyBindingByAccountId(accountId) {
	return getAccountPolicyBindingByAccountIdStmt.get(accountId) || null
}

export function setAccountPolicyBinding({
	accountId,
	toolPolicyId,
	filePolicyId
}) {
	upsertAccountPolicyBindingStmt.run(accountId, toolPolicyId, filePolicyId)
	return getAccountPolicyBindingByAccountId(accountId)
}

export function listAccountsByToolPolicyId(policyId) {
	return listAccountsByToolPolicyIdStmt.all(policyId).map(parseAccountRow)
}

export function listAccountsByFilePolicyId(policyId) {
	return listAccountsByFilePolicyIdStmt.all(policyId).map(parseAccountRow)
}

export function reassignAccountsToToolPolicy(fromPolicyId, toPolicyId) {
	reassignToolPolicyStmt.run(toPolicyId, fromPolicyId)
}

export function reassignAccountsToFilePolicy(fromPolicyId, toPolicyId) {
	reassignFilePolicyStmt.run(toPolicyId, fromPolicyId)
}

export function getDefaultToolPolicy() {
	return getToolPolicyByName(DEFAULT_TOOL_POLICY_NAME)
}

export function getDefaultFilePolicy() {
	return getFilePolicyByName(DEFAULT_FILE_POLICY_NAME)
}

export default db
