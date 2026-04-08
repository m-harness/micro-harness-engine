import dotenv from 'dotenv'
import { createPendingApproval } from '../approval.js'
import {
	createAccessDeniedResult
} from '../access/service.js'
import { isAccessError } from '../access/errors.js'
import {
	createProtectionResult
} from '../../protection/service.js'
import { isProtectionError } from '../../protection/errors.js'
import { getAgentPolicy } from '../policy.js'
import {
	authorizeToolRequest,
	canAccountUseTool,
	createToolAuthorizationFailure,
	getSessionOperatorAccountId
} from '../policyService.js'
import { getPluginEntries, getToolCatalogSnapshot, getToolEntry } from './catalog.js'

dotenv.config()

function isToolExposed(tool, runtimePolicy) {
	if (tool.riskLevel !== 'dangerous') {
		return true
	}

	return runtimePolicy.allowDangerousTools
}

function assertToolExecutionAllowed(tool, input, runtimePolicy) {
	if (tool.riskLevel !== 'dangerous') {
		return
	}

	if (!runtimePolicy.allowDangerousTools) {
		throw new Error(
			'Dangerous tool is disabled by runtime policy. Set AGENT_MODE=unsafe or ALLOW_DANGEROUS_TOOLS=true to enable it.'
		)
	}

	if (runtimePolicy.requireDangerousConfirmation && input.confirm !== 'DELETE') {
		throw new Error('Dangerous tool requires confirm="DELETE".')
	}
}

export function getToolRegistrySnapshot(options = {}) {
	const accountId = options.accountId || null
	const catalog = getToolCatalogSnapshot()

	if (!accountId) {
		return catalog.map(plugin => ({
			name: plugin.name,
			description: plugin.description,
			tools: plugin.tools.map(tool => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
				riskLevel: tool.riskLevel
			}))
		}))
	}

	return catalog
		.map(plugin => ({
			...plugin,
			tools: plugin.tools.filter(tool => canAccountUseTool(accountId, tool.name))
		}))
		.filter(plugin => plugin.tools.length > 0)
}

export function getToolDefinitions(options = {}) {
	const runtimePolicy = options.runtimePolicy || getAgentPolicy()
	const accountId = options.accountId || null

	return getPluginEntries().flatMap(plugin =>
		plugin.tools
			.filter(tool => isToolExposed(tool, runtimePolicy))
			.filter(tool => !accountId || canAccountUseTool(accountId, tool.name))
			.map(({ name, description, input_schema }) => ({
				name,
				description,
				input_schema
			}))
	)
}

export async function executeTool(toolName, input = {}, options = {}) {
	const runtimePolicy = options.policy || getAgentPolicy()
	const tool = getToolEntry(toolName)

	if (!tool) {
		throw new Error(`Unknown or disabled tool: ${toolName}`)
	}

	try {
		if (options.sessionToken) {
			const authResult = authorizeToolRequest({
				sessionToken: options.sessionToken,
				toolName,
				input
			})

			if (authResult.decision.decision !== 'ALLOW') {
				return createToolAuthorizationFailure(
					authResult.decision,
					toolName,
					authResult.resource
				)
			}
		}

		if (
			tool.riskLevel === 'dangerous' &&
			runtimePolicy.requireHumanApproval &&
			!options.approvalGranted
		) {
			if (!options.sessionToken) {
				throw new Error(
					'Guided mode requires a session token to store pending approvals.'
				)
			}

			const pendingApproval = createPendingApproval(options.sessionToken, {
				toolName,
				input,
				reason: 'Dangerous tool requested in guided mode.'
			})

			return {
				ok: false,
				approvalRequired: true,
				approvalId: pendingApproval.id,
				toolName,
				message: 'Human approval is required before this dangerous tool can run.',
				nextStep: 'Ask the user to type y to continue or n to cancel.'
			}
		}

		assertToolExecutionAllowed(tool, input, runtimePolicy)

		return await tool.execute(input, {
			policy: runtimePolicy,
			sessionToken: options.sessionToken,
			accountId: options.sessionToken
				? getSessionOperatorAccountId(options.sessionToken)
				: null,
			approvalGranted: options.approvalGranted === true,
			toolName: tool.name,
			pluginName: tool.pluginName
		})
	} catch (error) {
		if (isAccessError(error)) {
			return createAccessDeniedResult(error)
		}

		if (isProtectionError(error)) {
			return createProtectionResult(error)
		}

		throw error
	}
}
