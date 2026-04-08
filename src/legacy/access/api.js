import { getAccountPolicyBindingByAccountId, listFilePolicyRoots } from '../db.js'
import { LOCAL_OPERATOR_ACCOUNT_ID } from '../policyDefaults.js'
import { addRootToFilePolicy } from '../policyService.js'
import { resolveToolPath } from './service.js'

function getLocalOperatorFilePolicyId() {
	const binding = getAccountPolicyBindingByAccountId(LOCAL_OPERATOR_ACCOUNT_ID)
	return binding?.filePolicyId ?? null
}

export function listAccessRootsApi() {
	const filePolicyId = getLocalOperatorFilePolicyId()
	const roots = filePolicyId ? listFilePolicyRoots(filePolicyId) : []

	return {
		ok: true,
		roots: roots.map(root => ({
			...root,
			enabled: true
		}))
	}
}

export function createAccessRootApi({
	kind,
	targetPath
}) {
	const filePolicyId = getLocalOperatorFilePolicyId()
	if (!filePolicyId) {
		return {
			ok: false,
			error: 'The local operator does not have a file policy binding.'
		}
	}

	try {
		const policy = addRootToFilePolicy(filePolicyId, {
			absolutePath: targetPath,
			pathType: kind
		})

		return {
			ok: true,
			root: policy.roots.at(-1),
			message: `Added ${kind} root to ${policy.name}.`
		}
	} catch (error) {
		return {
			ok: false,
			error: error.message
		}
	}
}

export function setAccessRootEnabledApi(rootId) {
	return {
		ok: false,
		error: 'Per-root enable/disable is not supported in the redesigned file policy system.'
	}
}

export function removeAccessRootApi() {
	return {
		ok: false,
		error: 'Use the file policy UI to remove roots in the redesigned file policy system.'
	}
}

export function inspectAccessPathApi(targetPath) {
	try {
		const resolved = resolveToolPath(targetPath, {
			action: 'read',
			accountId: LOCAL_OPERATOR_ACCOUNT_ID
		})

		return {
			ok: true,
			path: targetPath,
			action: 'read',
			scope: resolved.scope,
			allowlisted: true
		}
	} catch (error) {
		return {
			ok: true,
			path: targetPath,
			action: 'read',
			scope: 'external',
			allowlisted: false,
			reason: error.reason || 'access_denied'
		}
	}
}
