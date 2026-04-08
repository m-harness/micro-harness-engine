import http from './axios.js'

export const api = {
	getHealth() {
		return http.get('/api/health')
	},
	getAuthState() {
		return http.get('/api/auth/me')
	},
	bootstrapAdmin(body) {
		return http.post('/api/bootstrap/admin', body)
	},
	login(body) {
		return http.post('/api/auth/login', body)
	},
	logout() {
		return http.post('/api/auth/logout')
	},
	getBootstrap() {
		return http.get('/api/bootstrap')
	},
	createConversation({ title }) {
		return http.post('/api/conversations', { title })
	},
	getConversation(conversationId) {
		return http.get(`/api/conversations/${encodeURIComponent(conversationId)}`)
	},
	postConversationMessage(conversationId, { text }) {
		return http.post(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, { text })
	},
	createAutomation(conversationId, { name, instruction, intervalMinutes }) {
		return http.post(`/api/conversations/${encodeURIComponent(conversationId)}/automations`, { name, instruction, intervalMinutes })
	},
	updateAutomationStatus(automationId, { status }) {
		return http.patch(`/api/automations/${encodeURIComponent(automationId)}`, { status })
	},
	deleteAutomation(automationId) {
		return http.delete(`/api/automations/${encodeURIComponent(automationId)}`)
	},
	runAutomationNow(automationId) {
		return http.post(`/api/automations/${encodeURIComponent(automationId)}/run-now`)
	},
	decideApproval(approvalId, { decision }) {
		return http.post(`/api/approvals/${encodeURIComponent(approvalId)}/decision`, { decision })
	},
	createToken({ name }) {
		return http.post('/api/me/tokens', { name })
	},
	revokeToken(tokenId) {
		return http.delete(`/api/me/tokens/${encodeURIComponent(tokenId)}`)
	},
	getAdminAuthState() {
		return http.get('/api/admin/auth/me')
	},
	adminLogin(body) {
		return http.post('/api/admin/auth/login', body)
	},
	adminLogout() {
		return http.post('/api/admin/auth/logout')
	},
	getAdminBootstrap() {
		return http.get('/api/admin/bootstrap')
	},
	adminCreateUser({ loginName, displayName, password, role }) {
		return http.post('/api/admin/users', { loginName, displayName, password, role })
	},
	adminUpdateUser(userId, { loginName, displayName, role, status }) {
		return http.patch(`/api/admin/users/${encodeURIComponent(userId)}`, { loginName, displayName, role, status })
	},
	adminDeleteUser(userId) {
		return http.delete(`/api/admin/users/${encodeURIComponent(userId)}`)
	},
	adminSetUserPassword(userId, { password }) {
		return http.post(`/api/admin/users/${encodeURIComponent(userId)}/password`, { password })
	},
	adminAssignPolicies(userId, { toolPolicyId, filePolicyId }) {
		return http.patch(`/api/admin/users/${encodeURIComponent(userId)}/policies`, { toolPolicyId, filePolicyId })
	},
	adminCreateToolPolicy({ name, description, tools }) {
		return http.post('/api/admin/tool-policies', { name, description, tools })
	},
	adminUpdateToolPolicy(policyId, { name, description, tools }) {
		return http.patch(`/api/admin/tool-policies/${encodeURIComponent(policyId)}`, { name, description, tools })
	},
	adminDeleteToolPolicy(policyId, { replacementPolicyId }) {
		return http.delete(`/api/admin/tool-policies/${encodeURIComponent(policyId)}`, { data: { replacementPolicyId } })
	},
	adminCreateFilePolicy({ name, description }) {
		return http.post('/api/admin/file-policies', { name, description })
	},
	adminUpdateFilePolicy(policyId, { name, description }) {
		return http.patch(`/api/admin/file-policies/${encodeURIComponent(policyId)}`, { name, description })
	},
	adminDeleteFilePolicy(policyId, { replacementPolicyId }) {
		return http.delete(`/api/admin/file-policies/${encodeURIComponent(policyId)}`, { data: { replacementPolicyId } })
	},
	adminAddFilePolicyRoot(policyId, { scope, rootPath, pathType }) {
		return http.post(`/api/admin/file-policies/${encodeURIComponent(policyId)}/roots`, { scope, rootPath, pathType })
	},
	adminDeleteFilePolicyRoot(policyId, rootId) {
		return http.delete(`/api/admin/file-policies/${encodeURIComponent(policyId)}/roots/${encodeURIComponent(rootId)}`)
	},
	adminProbePath(targetPath) {
		return http.get(`/api/admin/fs/probe?path=${encodeURIComponent(targetPath)}`)
	},
	adminBrowseFileSystem(targetPath = null) {
		const suffix = targetPath ? `?path=${encodeURIComponent(targetPath)}` : ''
		return http.get(`/api/admin/fs/browse${suffix}`)
	},
	adminDecideApproval(approvalId, { decision }) {
		return http.post(`/api/admin/approvals/${encodeURIComponent(approvalId)}/decision`, { decision })
	},
	adminPauseAutomation(automationId) {
		return http.patch(`/api/admin/automations/${encodeURIComponent(automationId)}`, { status: 'paused' })
	},
	adminDeleteAutomation(automationId) {
		return http.delete(`/api/admin/automations/${encodeURIComponent(automationId)}`)
	},
	adminListProtectionRules() {
		return http.get('/api/admin/protection-rules')
	},
	adminCreateProtectionRule({ kind, pattern }) {
		return http.post('/api/admin/protection-rules', { kind, pattern })
	},
	adminToggleProtectionRule(ruleId, { enabled }) {
		return http.patch(`/api/admin/protection-rules/${encodeURIComponent(ruleId)}`, { enabled })
	},
	adminDeleteProtectionRule(ruleId) {
		return http.delete(`/api/admin/protection-rules/${encodeURIComponent(ruleId)}`)
	},
	adminInspectProtectionPath({ path }) {
		return http.post('/api/admin/protection-rules/inspect', { path })
	},
	adminCreateSkill({ name, description, prompt }) {
		return http.post('/api/admin/skills', { name, description, prompt })
	},
	adminUpdateSkill(name, { description, prompt }) {
		return http.patch(`/api/admin/skills/${encodeURIComponent(name)}`, { description, prompt })
	},
	adminDeleteSkill(name) {
		return http.delete(`/api/admin/skills/${encodeURIComponent(name)}`)
	},
	adminCreateMcpServer({ name, config }) {
		return http.post('/api/admin/mcp-servers', { name, config })
	},
	adminUpdateMcpServer(name, { config }) {
		return http.patch(`/api/admin/mcp-servers/${encodeURIComponent(name)}`, { config })
	},
	adminDeleteMcpServer(name) {
		return http.delete(`/api/admin/mcp-servers/${encodeURIComponent(name)}`)
	},
	adminReconnectMcpServer(name) {
		return http.post(`/api/admin/mcp-servers/${encodeURIComponent(name)}/reconnect`)
	}
}
