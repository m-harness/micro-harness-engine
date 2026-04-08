import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './components/shared/ProtectedRoute.jsx'
import { setNavigateRef } from './lib/navigateRef.js'

const LoginPage = lazy(() => import('./pages/workspace/LoginPage.jsx'))
const WorkspacePage = lazy(() => import('./pages/workspace/WorkspacePage.jsx'))
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage.jsx'))
const OverviewPage = lazy(() => import('./pages/admin/OverviewPage.jsx'))
const UsersPage = lazy(() => import('./pages/admin/UsersPage.jsx'))
const ToolPoliciesPage = lazy(() => import('./pages/admin/ToolPoliciesPage.jsx'))
const FilePoliciesPage = lazy(() => import('./pages/admin/FilePoliciesPage.jsx'))
const ProtectionRulesPage = lazy(() => import('./pages/admin/ProtectionRulesPage.jsx'))
const ApprovalsPage = lazy(() => import('./pages/admin/ApprovalsPage.jsx'))
const AutomationsPage = lazy(() => import('./pages/admin/AutomationsPage.jsx'))
const ToolsPage = lazy(() => import('./pages/admin/ToolsPage.jsx'))
const SkillsPage = lazy(() => import('./pages/admin/SkillsPage.jsx'))
const McpServersPage = lazy(() => import('./pages/admin/McpServersPage.jsx'))

const WorkspaceLayout = lazy(() => import('./components/layout/WorkspaceLayout.jsx'))
const AdminLayout = lazy(() => import('./components/layout/AdminLayout.jsx'))

function Loading() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="animate-pulse rounded-2xl border bg-card px-6 py-5 text-sm font-semibold tracking-widest text-muted-foreground shadow-panel">
				Loading...
			</div>
		</div>
	)
}

function NavigateInjector() {
	const navigate = useNavigate()
	const location = useLocation()
	useEffect(() => {
		setNavigateRef(navigate, () => location.pathname)
	}, [navigate, location.pathname])
	return null
}

export default function App() {
	return (
		<Suspense fallback={<Loading />}>
			<NavigateInjector />
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/admin/login" element={<AdminLoginPage />} />

				<Route element={<ProtectedRoute type="user" />}>
					<Route element={<WorkspaceLayout />}>
						<Route index element={<WorkspacePage />} />
						<Route path="/c/:conversationId" element={<WorkspacePage />} />
					</Route>
				</Route>

				<Route element={<ProtectedRoute type="admin" />}>
					<Route path="/admin" element={<AdminLayout />}>
						<Route index element={<OverviewPage />} />
						<Route path="users" element={<UsersPage />} />
						<Route path="tool-policies" element={<ToolPoliciesPage />} />
						<Route path="file-policies" element={<FilePoliciesPage />} />
						<Route path="protection-rules" element={<ProtectionRulesPage />} />
						<Route path="approvals" element={<ApprovalsPage />} />
						<Route path="automations" element={<AutomationsPage />} />
						<Route path="tools" element={<ToolsPage />} />
						<Route path="skills" element={<SkillsPage />} />
						<Route path="mcp-servers" element={<McpServersPage />} />
					</Route>
				</Route>

				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</Suspense>
	)
}
