import dotenv from 'dotenv'

dotenv.config()

const VALID_AGENT_MODES = new Set(['learning', 'guided', 'unsafe'])

function parseBoolean(value, defaultValue = false) {
	if (value == null) {
		return defaultValue
	}

	return value === 'true'
}

function normalizeAgentMode(value) {
	if (!value) {
		return 'learning'
	}

	const normalized = value.trim().toLowerCase()
	return VALID_AGENT_MODES.has(normalized) ? normalized : 'learning'
}

function readRecoveryFlag(value) {
	if (value == null) {
		return false
	}

	const normalized = String(value).trim().toLowerCase()
	return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

export function getAgentPolicy() {
	const mode = normalizeAgentMode(process.env.AGENT_MODE)
	const allowDangerousTools = mode === 'unsafe' || mode === 'guided' || parseBoolean(process.env.ALLOW_DANGEROUS_TOOLS, false)
	const requireDangerousConfirmation = parseBoolean(
		process.env.REQUIRE_DANGEROUS_TOOL_CONFIRMATION,
		true
	)
	const requireHumanApproval = mode === 'guided'

	return {
		mode,
		allowDangerousTools,
		requireDangerousConfirmation,
		requireHumanApproval
	}
}

export function isPolicyRecoveryModeEnabled() {
	return (
		readRecoveryFlag(process.env.POLICY_RECOVERY_MODE) ||
		process.argv.includes('--policy-recovery')
	)
}

export function getPolicySummary(policy = getAgentPolicy()) {
	return {
		mode: policy.mode,
		allowDangerousTools: policy.allowDangerousTools,
		requireDangerousConfirmation: policy.requireDangerousConfirmation,
		requireHumanApproval: policy.requireHumanApproval,
		recoveryMode: isPolicyRecoveryModeEnabled()
	}
}
