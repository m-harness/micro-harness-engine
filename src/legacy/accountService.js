import {
	createAccount,
	getAccountById,
	getAccountPolicyBindingByAccountId,
	getAllAccounts,
	getDefaultFilePolicy,
	getDefaultToolPolicy,
	getFilePolicyById,
	getToolPolicyById,
	setAccountPolicyBinding,
	touchAccountAuthRevision,
	updateAccount
} from './db.js'

function normalizeAccountId(accountId) {
	return String(accountId || '').trim()
}

function normalizeDisplayName(displayName) {
	return String(displayName || '').trim()
}

function normalizeStatus(status) {
	if (status == null || status === '') {
		return 'active'
	}

	if (status !== 'active' && status !== 'disabled') {
		throw new Error('status must be active or disabled.')
	}

	return status
}

function getAdminCount() {
	return getAllAccounts().filter(account => account.isAdmin && account.status === 'active').length
}

function assertLastAdminRetained(nextAccount) {
	if (nextAccount.isAdmin && nextAccount.status === 'active') {
		return
	}

	const current = getAccountById(nextAccount.id)
	if (!current || !current.isAdmin || current.status !== 'active') {
		return
	}

	if (getAdminCount() <= 1) {
		throw new Error('The last active admin cannot be removed or disabled.')
	}
}

function buildAccountSummary(account) {
	if (!account) {
		return null
	}

	const binding = getAccountPolicyBindingByAccountId(account.id)
	const toolPolicy = binding ? getToolPolicyById(binding.toolPolicyId) : null
	const filePolicy = binding ? getFilePolicyById(binding.filePolicyId) : null

	return {
		...account,
		toolPolicy,
		filePolicy
	}
}

function assertPolicyBindingExists(toolPolicyId, filePolicyId) {
	const toolPolicy = getToolPolicyById(toolPolicyId)
	if (!toolPolicy) {
		throw new Error(`Unknown tool policy: ${toolPolicyId}`)
	}

	const filePolicy = getFilePolicyById(filePolicyId)
	if (!filePolicy) {
		throw new Error(`Unknown file policy: ${filePolicyId}`)
	}

	return { toolPolicy, filePolicy }
}

export function listAccountsWithPolicies() {
	return getAllAccounts().map(buildAccountSummary)
}

export function getAccountWithPolicy(accountId) {
	return buildAccountSummary(getAccountById(accountId))
}

export function createLocalAccount({
	id,
	displayName,
	isAdmin = false,
	status = 'active'
}) {
	const normalizedId = normalizeAccountId(id)
	const normalizedDisplayName = normalizeDisplayName(displayName)

	if (!normalizedId) {
		throw new Error('id is required.')
	}

	if (!/^[a-z0-9][a-z0-9-_]{1,63}$/i.test(normalizedId)) {
		throw new Error('id must be 2-64 characters and use letters, numbers, - or _.')
	}

	if (!normalizedDisplayName) {
		throw new Error('displayName is required.')
	}

	if (getAccountById(normalizedId)) {
		throw new Error(`Account ${normalizedId} already exists.`)
	}

	const account = createAccount({
		id: normalizedId,
		displayName: normalizedDisplayName,
		status: normalizeStatus(status),
		isAdmin: Boolean(isAdmin),
		authRevision: 1
	})

	const defaultToolPolicy = getDefaultToolPolicy()
	const defaultFilePolicy = getDefaultFilePolicy()

	setAccountPolicyBinding({
		accountId: account.id,
		toolPolicyId: defaultToolPolicy.id,
		filePolicyId: defaultFilePolicy.id
	})

	return getAccountWithPolicy(account.id)
}

export function updateLocalAccount(accountId, updates = {}) {
	const current = getAccountById(accountId)
	if (!current) {
		throw new Error(`Unknown account: ${accountId}`)
	}

	const nextAccount = {
		...current,
		displayName: updates.displayName != null
			? normalizeDisplayName(updates.displayName)
			: current.displayName,
		status: updates.status != null
			? normalizeStatus(updates.status)
			: current.status,
		isAdmin: updates.isAdmin != null
			? Boolean(updates.isAdmin)
			: current.isAdmin
	}

	if (!nextAccount.displayName) {
		throw new Error('displayName must not be empty.')
	}

	assertLastAdminRetained(nextAccount)

	updateAccount({
		id: current.id,
		displayName: nextAccount.displayName,
		status: nextAccount.status,
		isAdmin: nextAccount.isAdmin
	})

	if (
		nextAccount.status !== current.status ||
		nextAccount.isAdmin !== current.isAdmin
	) {
		touchAccountAuthRevision(current.id)
	}

	return getAccountWithPolicy(current.id)
}

export function updateAccountPolicies(accountId, {
	toolPolicyId,
	filePolicyId
}) {
	const account = getAccountById(accountId)
	if (!account) {
		throw new Error(`Unknown account: ${accountId}`)
	}

	const binding = getAccountPolicyBindingByAccountId(accountId)
	const nextToolPolicyId = toolPolicyId ?? binding?.toolPolicyId
	const nextFilePolicyId = filePolicyId ?? binding?.filePolicyId

	assertPolicyBindingExists(nextToolPolicyId, nextFilePolicyId)

	setAccountPolicyBinding({
		accountId,
		toolPolicyId: nextToolPolicyId,
		filePolicyId: nextFilePolicyId
	})

	touchAccountAuthRevision(accountId)
	return getAccountWithPolicy(accountId)
}
