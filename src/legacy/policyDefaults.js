export const LOCAL_OPERATOR_ACCOUNT_ID = 'local-operator'

export const DEFAULT_TOOL_POLICY_NAME = 'default-no-tools'
export const DEFAULT_FILE_POLICY_NAME = 'default-workspace-only'
export const SYSTEM_ALL_TOOLS_POLICY_NAME = 'system-all-tools'

export function getSystemToolPolicySeeds() {
	return [
		{
			name: DEFAULT_TOOL_POLICY_NAME,
			description: 'Default deny. No tools are available.',
			isSystem: true,
			tools: []
		},
		{
			name: SYSTEM_ALL_TOOLS_POLICY_NAME,
			description: 'System policy that exposes every discovered tool to the local operator.',
			isSystem: true,
			tools: []
		}
	]
}

export function getSystemFilePolicySeeds() {
	return [
		{
			name: DEFAULT_FILE_POLICY_NAME,
			description: 'Workspace paths are available. No external roots are allowed.',
			isSystem: true
		}
	]
}
