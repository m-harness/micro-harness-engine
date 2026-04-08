import { loadPlugins, getAllToolEntries, getToolEntry } from './catalog.js'
import {
	resolveProjectPath,
	getTextPreview,
	resolveThroughExistingAncestor,
	createApprovalResponse,
	assertPathActionAllowed,
	filterDiscoverableEntries,
	createProtectionResult
} from './helpers.js'
import { isProtectionError } from '../../protection/errors.js'

export async function createToolRegistry({ automationService, policyService }) {
	let activePolicyService = policyService || null

	await loadPlugins()

	function buildToolMap() {
		return new Map(getAllToolEntries().map(tool => [tool.name, tool]))
	}

	let toolMap = buildToolMap()

	function getTools() {
		return getAllToolEntries()
	}

	function buildContext(context) {
		return {
			...context,
			policyService: activePolicyService,
			helpers: {
				resolveProjectPath,
				getTextPreview,
				resolveThroughExistingAncestor,
				createApprovalResponse,
				assertPathActionAllowed,
				filterDiscoverableEntries
			},
			services: {
				automationService
			}
		}
	}

	return {
		getDefinitions() {
			return getTools().map(tool => ({
				name: tool.name,
				description: tool.description,
				input_schema: tool.input_schema
			}))
		},

		listTools() {
			return getTools().map(tool => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.input_schema,
				riskLevel: tool.riskLevel,
				pluginName: tool.pluginName
			}))
		},

		async execute(toolName, input, context) {
			const tool = toolMap.get(toolName)
			if (!tool) {
				throw new Error(`Unknown tool: ${toolName}`)
			}

			if (activePolicyService && context?.userId) {
				activePolicyService.assertToolAllowed(context.userId, toolName)
			}

			const enrichedContext = buildContext(context)

			try {
				return await tool.execute(input, enrichedContext)
			} catch (error) {
				if (isProtectionError(error)) {
					return createProtectionResult(error)
				}
				return {
					ok: false,
					error: error?.message || String(error)
				}
			}
		},

		setPolicyService(nextPolicyService) {
			activePolicyService = nextPolicyService || null
		},

		async reload() {
			await loadPlugins()
			toolMap = buildToolMap()
		}
	}
}
