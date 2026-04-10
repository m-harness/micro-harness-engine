English | [日本語](../ja/ui-functional-spec.md)

# microHarnessEngine Web UI Functional Specification

> **Purpose**: A specification to ensure no functionality is lost when completely rebuilding the UI appearance.
> The premise is that the API and logic remain unchanged. The tech stack continues with React + Tailwind CSS + Vite.

---

## 1. Application Structure

### 1.1 Two Independent Screens

| Screen | Path | Authentication | Purpose |
|--------|------|----------------|---------|
| **User Workspace** | `/`, `/c/:conversationId` | User session (`microharnessengine_session` cookie) | Chat, approvals, automations, API token management |
| **Admin Console** | `/admin/*` | Admin session (`microharnessengine_admin_session` cookie) | User provisioning, policy management, operational monitoring |

- Routing uses `react-router-dom` v6 (`BrowserRouter` + `lazy()` + `Suspense`)
- All pages are code-split (`lazy()` imports)

### 1.2 Entry Point

```
main.jsx -> <BrowserRouter>
  +-- <JotaiProvider>
       +-- <Toaster richColors position="top-right" />  (sonner)
            +-- <App />  (route definitions)
```

### 1.3 Route Table

| Path | Component | Auth Guard | Layout |
|------|-----------|------------|--------|
| `/login` | `LoginPage` | None | None |
| `/admin/login` | `AdminLoginPage` | None | None |
| `/` (index) | `WorkspacePage` | `ProtectedRoute type="user"` | `WorkspaceLayout` |
| `/c/:conversationId` | `WorkspacePage` | `ProtectedRoute type="user"` | `WorkspaceLayout` |
| `/admin` (index) | `OverviewPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/users` | `UsersPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/tool-policies` | `ToolPoliciesPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/file-policies` | `FilePoliciesPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/protection-rules` | `ProtectionRulesPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/approvals` | `ApprovalsPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/automations` | `AutomationsPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/tools` | `ToolsPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/skills` | `SkillsPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `/admin/mcp-servers` | `McpServersPage` | `ProtectedRoute type="admin"` | `AdminLayout` |
| `*` (catch-all) | `Navigate to="/"` | None | None |

`ProtectedRoute`: On mount, calls `api.getAuthState()` (user) / `api.getAdminAuthState()` (admin). Redirects to `/login` or `/admin/login` if unauthenticated.

### 1.4 Navigation from Non-React Code

`navigateRef.js` captures `useNavigate()` / `useLocation()` into a module-level ref, allowing the axios interceptor (e.g., 401 redirect) to call them.

---

## 2. Common Patterns

### 2.1 State Management (jotai)

Global state is managed with jotai atoms. All atoms are plain `atom()` primitives.

#### workspace.js

| Atom | Default Value | Purpose |
|------|---------------|---------|
| `workspaceAtom` | `{ conversations: [], apiTokens: [] }` | Bootstrap data |
| `selectedConversationIdAtom` | `null` | Currently selected conversation ID |
| `conversationViewAtom` | `null` | Selected conversation detail (messages, approvals, automations, activeRun, lastFailedRun) |
| `streamingMessageAtom` | `null` | SSE streaming text accumulation `{ text, runId }` |

#### ui.js

| Atom | Default Value | Purpose |
|------|---------------|---------|
| `themeAtom` | `localStorage 'mhe-theme'` or `'light'` | Dark/light theme |
| `workspaceBusyKeyAtom` | `''` | Workspace loading state |
| `adminBusyKeyAtom` | `''` | Admin panel loading state |

#### auth.js

| Atom | Default Value | Purpose |
|------|---------------|---------|
| `authStateAtom` | `{ user: null, csrfToken: '', bootstrapRequired: false, webBootstrapEnabled: false }` | User auth state |
| `adminAuthStateAtom` | `{ adminAuthenticated: false, csrfToken: '', adminEnabled: false, user: null }` | Admin auth state |

#### admin.js

| Atom | Default Value | Purpose |
|------|---------------|---------|
| `adminDataAtom` | `null` | Admin bootstrap data |

### 2.2 API Communication Layer

#### REST (lib/api.js + lib/axios.js)

- `axios` instance with `withCredentials: true`
- Request interceptor: adds `x-csrf-token` header on non-GET requests (separate tokens for user/admin)
- Response interceptor: unwraps `{ ok, data, error }` envelope, returns `data`. On 401, redirects to login via `navigateRef`
- On error: `throw new Error(payload.error)` -> caught by `runAction`

#### SSE (lib/sse.js)

`createSSEConnection(url, { onEvent, onError, onClose })` --- A custom implementation using `fetch()` + `ReadableStream` rather than the native `EventSource` API:

- `credentials: 'include'` for cookie authentication
- `Accept: 'text/event-stream'` header
- Response body read chunk-by-chunk via `getReader()`
- Event boundaries split on `\n\n`, parsing `event:` / `data:` lines
- Comment lines starting with `:` (heartbeats) are ignored
- `data` is parsed with `JSON.parse()`; falls back to raw string on failure
- Callbacks: `onEvent({ type, data })`, `onError(err)`, `onClose()`
- Returns: `{ close() }` --- disconnects via `AbortController.abort()`
- `AbortError` is silently ignored as an intentional close

### 2.3 Loading Management (`workspaceBusyKeyAtom` + `runAction` Pattern)

```javascript
const runAction = useCallback(async (key, callback) => {
    setBusyKey(key)        // set workspaceBusyKeyAtom
    try {
        await callback()
    } catch (error) {
        toast.error(error.message)   // sonner toast
    } finally {
        setBusyKey('')     // clear
    }
}, [setBusyKey])
```

- Each button uses `disabled={busyKey === 'key-name'}` to prevent double submission
- Button labels switch to "Sending..." etc. based on `busyKey`

**Keys used**: `'create-conversation'`, `'select-<id>'`, `'send-message'`, `'cancel-run'`, `'approval-<id>'`, `'create-automation'`, `'automation-<id>'`, `'run-<id>'`, `'delete-<id>'`, `'create-token'`, `'revoke-<id>'`

The admin panel uses the same pattern with `adminBusyKeyAtom`.

### 2.4 Flash Messages (sonner toast)

Uses the `toast` function from the `sonner` library:

- `toast.error(message)` --- error notification (`runAction` catch, login failure, etc.)
- `toast.success(message)` --- success notification (login success, etc.)
- Configuration: `<Toaster richColors position="top-right" />`

### 2.5 Date Formatting

```javascript
new Intl.DateTimeFormat('ja-JP', {
  month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit'
}).format(new Date(value))
```

- Displays `'Not yet'` when value is absent

### 2.6 Status Badge (`StatusBadge` Component)

Status string to color mapping:

| Status | Color Scheme |
|--------|-------------|
| `active`, `completed`, `approved` | emerald (green) |
| `queued`, `running`, `waiting_approval`, `pending` | amber (yellow) |
| `recovering` | orange |
| `paused` | slate (gray) |
| `cancelled` | slate (gray) |
| `denied`, `failed`, `disabled`, `deleted` | rose (red) |
| Other | slate (gray) default |

### 2.7 Confirmation Dialogs

- Deletion operations use `window.confirm()` for confirmation (not custom modals)
- Only policy deletion uses `DeletePolicyDialog` (custom modal)

### 2.8 Animations (framer-motion)

Presets defined in `lib/motion.js`:
- `fadeInUp`, `fadeIn`, `scaleIn`, `stagger(index)`
- Respects `prefers-reduced-motion`

### 2.9 i18n (Internationalization)

- `i18n/translations.js` contains `en` / `ja` translation dictionaries
- `i18n/context.jsx` contains `I18nProvider` + `useI18n` hook
- Locale is saved in `localStorage` (`microharnessengine-admin-web.locale`)
- Browser language is auto-detected
- **Note**: The current pages use English text directly, and the i18n context is not in use

---

## 3. User Workspace

### 3.1 Workspace Lifecycle

```
Mount
  +-- loadWorkspace(preferredConversationId?)
       |-- api.getBootstrap() -> workspaceAtom, authStateAtom updated
       +-- loadConversation(id, conversations)
            +-- api.getConversation() -> conversationViewAtom updated

Real-time updates (primary: SSE)
  |-- On SSE connection success:
  |    +-- createSSEConnection(/api/conversations/:id/stream)
  |         |-- delta -> accumulate text in streamingMessageAtom
  |         |-- run.completed / run.cancelled / run.failed
  |         |    -> clear streamingMessageAtom + loadWorkspace()
  |         +-- approval.requested -> loadWorkspace()
  |
  +-- On SSE error (fallback: polling):
       +-- Call loadWorkspace() every 4000ms
```

**SSE connection management**:
- `useSSE` is local React state (`useState(true)`)
- Set to `false` on SSE error, falling back to polling
- SSE reconnection is not performed automatically (until component remount)
- SSE is reconnected on conversation switch (`selectedConversationId` is in the `useEffect` dependency array)

### 3.2 Screen Transitions

```
[Initializing] -> Display "Authenticating..." (ProtectedRoute)
[Unauthenticated] -> Redirect to /login
[Authenticated] -> WorkspaceLayout + WorkspacePage
```

### 3.3 Login Screen (`LoginPage`)

**Layout**: 2-column grid (lg and above)

| Left Column | Right Column |
|-------------|-------------|
| Brand card (dark background) | Sign-in form + admin info card |

**Brand Card**:
- Title: "microHarnessEngine"
- Subtitle: "Private one-to-one AI chat for Web, Slack, and Discord."
- Includes description text

**Sign-in Form**:
- Fields: `loginName` (text), `password` (password)
- Button: "Sign in" (while loading: "Signing in...")
- Submit: `api.login(loginForm)` -> navigate to workspace
- Error: `toast.error(error.message)`

**Admin Info Card**:
- Title: "Admin-managed accounts"
- Code block: displays admin plane URL and CLI commands

### 3.4 Workspace Screen

**Overall Layout**: `WorkspaceLayout` (header + sidebar + main content)

#### 3.4.1 Header

- Brand label: "microHarnessEngine Workspace"
- User display name, @loginName, role
- Status Badge: activeRun status or "ready"
- Buttons: "New conversation", "Log out"

#### 3.4.2 Left Column: Conversation Sidebar (`ConversationSidebar`)

**When 0 conversations**: `EmptyState` component

**Conversation List**: Each conversation is a card element
- Selected: highlighted display
- Displayed information:
  - `title`
  - `source` (web/slack/discord)
  - Pending approval count badge (when `pendingApprovalCount > 0`)
  - Last message timestamp (`lastMessageAt` or `createdAt`)
  - Active run status (`activeRunStatus`)

**Behavior**: Click triggers `selectConversation(id)` -> URL navigation (`/c/:id`) + conversation load

#### 3.4.3 Center Column: Message Thread

##### Message List (`MessageList`)

- Directly references `streamingMessageAtom`
- Auto-scroll: scrolls to bottom on new messages and streaming text changes (`SCROLL_THRESHOLD = 50` detects user scroll-up)
- No conversation selected: `EmptyState` "No session selected"
- 0 messages: `EmptyState` "This conversation is ready"
- During streaming: displays `StreamingBubble` at the bottom

##### Message Bubble (`MessageBubble`)

| Role | Display |
|------|---------|
| `user` | Right-aligned, primary color background, white text |
| `assistant` | Left-aligned, card background, Markdown rendering via `react-markdown` + `remark-gfm` |
| `tool` | Center-aligned, dashed border, collapsible (`AnimatePresence`) |

- `framer-motion` for fade + slide-up entrance animation

##### Streaming Bubble (`StreamingBubble`)

- Same visual as assistant bubble
- Pulsing cursor (`animate-pulse bg-foreground/60`)
- Real-time Markdown rendering of streaming text

##### Tool Message (`ToolMessage`)

- Collapsible panel
- Tool name extracted via regex (`/^\[Tool\]\s+(\S+?)\(/`)
- `ChevronDown`/`ChevronUp` (lucide-react) icons
- framer-motion expand/collapse animation

##### Chat Input (`ChatInput`)

- Uses `useWorkspace()` for `sendMessage`, `cancelRun`, `busyKey`
- Form submit + `Ctrl/Cmd+Enter` shortcut
- `Escape` key to cancel active Run
- Active Run display: `StatusBadge` + phase info + spinner + stop button
- Failed Run error display: destructive-colored banner
- Send button: disabled while `isSending` or empty text

**Send Behavior**:
1. If text is empty, do nothing
2. If no `selectedConversationId`, create a new conversation
3. `sendMessage(text)` -> clear text

#### 3.4.4 Right Column: Sidebar (3 Cards)

##### (A) Approvals Card

**Title**: "Approvals"
**Description**: "Human decisions resume the paused run for this user only."

**When 0 approvals**: Text "No pending approvals in this session."

**Approval List**: Each approval item
- Status Badge + tool name (uppercase)
- Reason text (`reason`)
- Tool input JSON preview (`JSON.stringify(toolInput, null, 2)`)
- Buttons: "Approve", "Deny"
- Behavior: `handleApproval(id, decision)` -> `loadWorkspace()`

##### (B) Automations Card

**Title**: "Automations"

**Creation Form** (always visible):
- `name` (Input, placeholder: "Automation name")
- `instruction` (Textarea, placeholder: "What should this automation do?")
- `intervalMinutes` (Input type=number, min=5, placeholder: "60")
- Button: "Create"
- Behavior: `createAutomation()` -> clear form -> `loadWorkspace()`
- Prerequisite: `toast.error()` if no conversation is selected

**Automation List**: Each item
- Name + interval display (`formatInterval`)
- Status Badge
- Instruction text (`instruction`, whitespace-pre-wrap)
- Next run time
- Button group:
  - "Run now": `runAutomationNow()`
  - "Pause"/"Resume": `updateAutomationStatus()` (pause if active, activate if paused)
  - "Delete": `window.confirm()` -> `deleteAutomation()`

**Interval Display Rules**:
- None -> "Manual"
- Less than 60 -> "Every {n} min"
- Divisible by 60 -> "Every {n} hr"
- Other -> "Every {n} min"

##### (C) API Access Card

**Title**: "API access"

**Token Display** (when `revealedToken` exists):
- "Copy this token now" + teal background code block

**Creation Form**:
- `newTokenName` (Input, initial value: "Primary integration token")
- Button: "Create"
- Behavior: `createToken(name)` -> display token -> `loadWorkspace()`

**Token List**: Each token
- Name, creation time, last used time
- Button: "Revoke" (`window.confirm()` -> `revokeToken()`)

**When 0 tokens**: Text "No personal access tokens yet."

### 3.5 Logout Behavior

1. `api.logout()`
2. Reset state
3. Redirect to `/login`

---

## 4. Admin Console

### 4.1 Lifecycle

```
Mount
  +-- ProtectedRoute -> api.getAdminAuthState()
       |-- unauthenticated -> redirect to /admin/login
       +-- authenticated -> AdminLayout + page component
            +-- loadAdmin() -> api.getAdminBootstrap() -> adminDataAtom
```

- No polling (manual refresh only)
- `loadAdmin()` re-fetches data after every mutation

### 4.2 Authentication Screen (`AdminLoginPage`)

**Layout**: Center-aligned card

**Card Contents**:
- Title: "Admin Console"
- Description: explanation of root account
- Warning banner (amber) when admin is not enabled
- Form:
  - `loginName` (initial value: "root")
  - `password`
  - Button: "Enter admin console" (disabled if `adminEnabled` is false)
- Behavior: `api.adminLogin()` -> clear password -> redirect to `/admin`
- Error: `toast.error(error.message)`

### 4.3 Main Screen (`AdminLayout`)

**Overall Layout**: Sidebar navigation + main content (each page)

#### Sidebar
- Label: "Admin Plane"
- Logged-in user display: "@{loginName}"
- Logout button
- Navigation links (react-router-dom `NavLink`)

#### Page List

```
/admin (overview) | /admin/users | /admin/tool-policies | /admin/file-policies |
/admin/protection-rules | /admin/approvals | /admin/automations |
/admin/tools | /admin/skills | /admin/mcp-servers
```

### 4.4 Overview Tab

**Layout**: Grid

**Stat Cards** (7 cards):
| Label | Data Source |
|-------|------------|
| Users | `overview.userCount` |
| Pending approvals | `overview.pendingApprovalCount` |
| Automations | `overview.automationCount` |
| Tool policies | `overview.toolPolicyCount` |
| File policies | `overview.filePolicyCount` |
| Protection rules | `overview.protectionRuleCount` |
| Registered tools | `overview.toolCatalogCount` |

Each card displays `0` when the value is absent.

### 4.5 Users Tab

**Layout**: 2-column grid

#### Left: User List

**Each User Card**:
- Display name + @loginName
- Status Badge group: status, role, authSource, ("protected root" if root)
- Tool policy selector (`<select>`): changes are applied immediately -> `api.adminAssignPolicies()`
- File policy selector (`<select>`): changes are applied immediately -> `api.adminAssignPolicies()`
- Password change row: Input + "Set password" button
  - Disabled for root user (placeholder: "Managed by ADMIN_RUNTIME_PASSWORD")
- Status toggle button: "Disable"/"Enable"
  - Disabled for root user
- Delete button: "Delete"
  - Disabled for root or remote accounts
  - `window.confirm()` -> `api.adminDeleteUser()`

#### Right: User Creation Form

- `loginName`, `displayName`, `password`, `role` (select: "user" / "admin")
- Button: "Create user"
- Behavior: `api.adminCreateUser()` -> clear form -> `loadAdmin()`

### 4.6 Tool Policies Tab

**Layout**: 2-column grid

#### Left: Policy List

**Each Policy Card**:
- Name + description
- Badge: "system" or "custom"
- Custom only: "Edit" button, "Delete" button
- Tool list: each tool name + RiskBadge (inline)

**Edit**: Opens the tool policy edit modal
**Delete**: Opens `DeletePolicyDialog` (with replacement policy selection)

#### Right: Policy Creation Form

- If MCP servers exist: connection status legend
- `name`, `description`
- Tool checkbox list (scrollable):
  - Each tool: checkbox + name + MCP Badge + description + RiskBadge
- Button: "Create tool policy"

### 4.7 File Policies Tab

**Layout**: 2-column grid

#### Left: Policy List

**Each Policy Card**:
- Name + description + Badge: "system" / "custom"
- Custom only: "Edit policy", "Delete policy" buttons
- Root list: displayed in `scope:pathType:rootPath` format + "Delete" button
- Root addition row (custom only):
  - `rootPath` (Input), `pathType` (select: "dir" / "file")
  - "Choose path" button (file browser modal)
  - "Add root" button (scope is fixed as "absolute")

#### Right: Probe Path Card

- Path input + "Probe" button -> `api.adminProbePath()`
- Result: visible/not found, inside/outside workspace, pathType, resolved path

#### Modals

- File policy create/edit: `name`, `description`
- File browser (`FileBrowser`): directory expansion, path addition
- File policy delete (`DeletePolicyDialog`)

### 4.8 Protection Rules Tab

**Layout**: 2-column grid

#### Left: Rule List

- Warning banner: applied to workspace-relative paths
- Each rule: pattern + note + Badge group (patternType, scope, enabled state)
- "Enable"/"Disable", "Delete" buttons

#### Right Top: Rule Creation Card

- `kind` (select: path/dir/glob), `pattern`
- Button: "Create protection rule"

#### Right Bottom: Path Inspection Card

- Path input + "Inspect" button
- Result: "Protected" / "Not protected" + matched rule

### 4.9 Approvals Tab

- Approval list: Badge(status) + toolName + timestamp + reason + JSON input
- "Approve", "Deny" buttons -> `api.adminDecideApproval()`
- When 0 items: "No pending approvals."

### 4.10 Automations Tab

- List: name + owner ID + next run + Status Badge + instruction text
- "Pause" -> `api.adminPauseAutomation()`
- "Delete" -> `api.adminDeleteAutomation()`
- When 0 items: "No active automations."

### 4.11 Tools Tab

- MCP connection status legend
- Each tool: name + McpBadge + McpStatusBadge + RiskBadge + description + input_schema JSON

### 4.12 Skills Tab

**Layout**: 2-column grid

#### Left: Skill List
- Each skill: name + description + "Edit"/"Delete" buttons
- Inline editing: `description`, `prompt` (Textarea)

#### Right: Skill Creation Card
- `name`, `description`, `prompt`
- Button: "Create skill"

### 4.13 MCP Servers Tab

**Layout**: 2-column grid

#### Left: Server List

- Each server: name + protocol Badge + connection details + state Badge + tool count
- Inline editing + "Reconnect" + "Delete" buttons
- Post-reconnect polling: 2-second intervals, max 8 attempts

#### Right: Server Addition Card

- `name`, `mode` (stdio/http)
- stdio: `command`, `args`, `env` (KeyValueEditor)
- http: `url`, `headers` (KeyValueEditor)
- Button: "Add server"

---

## 5. Reusable Component Specifications

### 5.1 Button

```
variants: default | secondary | outline | ghost | destructive
sizes: default | sm
```
- Based on CVA (class-variance-authority)

### 5.2 Card / CardHeader / CardTitle / CardDescription / CardContent

- CardHeader: has bottom border
- CardContent: has padding
- Overall: rounded + border + shadow + background color

### 5.3 Input

- Text input
- On focus: primary color ring
- Rounded corners + border

### 5.4 Textarea

- Multi-line input
- Same focus style as Input

### 5.5 Label

- Form label

### 5.6 Badge

```
tones: default | success | warn | danger
```

### 5.7 Table / THead / TBody / TR / TH / TD

- Table components

### 5.8 DeletePolicyDialog

**Props**:
- `open`: visibility flag
- `title`, `description`: dialog description
- `policies`: array of replacement candidate policies
- `value`: selected replacement policy ID
- `replacementRequired`: whether users are assigned
- `replacementLabel`: additional description text
- `onChange(policyId)`, `onCancel()`, `onConfirm()`

### 5.9 FileBrowser

**Props**:
- `data`: `{ currentPath, nodes[] }`
- `onBrowse(targetPath)`: callback for directory expansion
- `onAddRoot(absolutePath, pathType)`: callback for path addition

### 5.10 EmptyState

**Props**: `title`, `description`, `action` (JSX)

A centered display component for empty states.

---

## 6. Complete API Endpoint List

### 6.1 Authentication

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| GET | `/api/auth/me` | No | Get authentication state |
| POST | `/api/auth/login` | No | User login |
| POST | `/api/auth/logout` | No | Logout |
| GET | `/api/admin/auth/me` | No | Admin authentication state |
| POST | `/api/admin/auth/login` | No | Admin login |
| POST | `/api/admin/auth/logout` | No | Admin logout |

### 6.2 Bootstrap

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| GET | `/api/bootstrap` | No | Get workspace data |
| GET | `/api/admin/bootstrap` | No | Get admin data in bulk |

### 6.3 Conversations

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/conversations` | Yes | Create conversation |
| GET | `/api/conversations/:id` | No | Get conversation details |
| POST | `/api/conversations/:id/messages` | Yes | Send message (202 async) |

### 6.4 SSE & Cancel

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| GET | `/api/conversations/:id/stream` | No | SSE streaming (text/event-stream) |
| POST | `/api/runs/:runId/cancel` | Yes | Cancel Run |

### 6.5 Approvals

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/approvals/:id/decision` | Yes | User approve/deny |
| POST | `/api/admin/approvals/:id/decision` | Yes | Admin approve/deny |

### 6.6 Automations

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/conversations/:id/automations` | Yes | Create |
| PATCH | `/api/automations/:id` | Yes | Change status |
| DELETE | `/api/automations/:id` | Yes | Delete |
| POST | `/api/automations/:id/run-now` | Yes | Run immediately |
| PATCH | `/api/admin/automations/:id` | Yes | Admin pause |
| DELETE | `/api/admin/automations/:id` | Yes | Admin delete |

### 6.7 API Tokens

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/me/tokens` | Yes | Create token |
| DELETE | `/api/me/tokens/:id` | Yes | Revoke token |

### 6.8 User Management

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/users` | Yes | Create user |
| PATCH | `/api/admin/users/:id` | Yes | Update user |
| DELETE | `/api/admin/users/:id` | Yes | Delete user |
| POST | `/api/admin/users/:id/password` | Yes | Set password |
| PATCH | `/api/admin/users/:id/policies` | Yes | Assign policies |

### 6.9 Tool Policies

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/tool-policies` | Yes | Create |
| PATCH | `/api/admin/tool-policies/:id` | Yes | Update |
| DELETE | `/api/admin/tool-policies/:id` | Yes | Delete (body: replacementPolicyId) |

### 6.10 File Policies

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/file-policies` | Yes | Create |
| PATCH | `/api/admin/file-policies/:id` | Yes | Update |
| DELETE | `/api/admin/file-policies/:id` | Yes | Delete (body: replacementPolicyId) |
| POST | `/api/admin/file-policies/:id/roots` | Yes | Add root |
| DELETE | `/api/admin/file-policies/:id/roots/:rootId` | Yes | Delete root |

### 6.11 File System

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| GET | `/api/admin/fs/probe?path=` | No | Probe path |
| GET | `/api/admin/fs/browse?path=` | No | Browse directory |

### 6.12 Protection Rules

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/protection-rules` | Yes | Create |
| PATCH | `/api/admin/protection-rules/:id` | Yes | Enable/disable toggle |
| DELETE | `/api/admin/protection-rules/:id` | Yes | Delete |
| POST | `/api/admin/protection-rules/inspect` | Yes | Inspect path protection |

### 6.13 Skills

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/skills` | Yes | Create |
| PATCH | `/api/admin/skills/:name` | Yes | Update |
| DELETE | `/api/admin/skills/:name` | Yes | Delete |

### 6.14 MCP Servers

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/mcp-servers` | Yes | Create |
| PATCH | `/api/admin/mcp-servers/:name` | Yes | Update |
| DELETE | `/api/admin/mcp-servers/:name` | Yes | Delete |
| POST | `/api/admin/mcp-servers/:name/reconnect` | Yes | Reconnect |

---

## 7. Data Models (Frontend Representation)

### 7.1 authState (User)

```typescript
{
  user: { id, loginName, displayName, role, status } | null
  csrfToken: string
  bootstrapRequired: boolean
  webBootstrapEnabled: boolean
}
```

### 7.2 authState (Admin)

```typescript
{
  adminAuthenticated: boolean
  csrfToken: string
  adminEnabled: boolean
  user: { id, loginName, displayName, role } | null
}
```

### 7.3 workspace

```typescript
{
  conversations: [{
    id, title, status, source,
    lastMessageAt, createdAt,
    pendingApprovalCount, activeRunStatus
  }]
  apiTokens: [{ id, name, createdAt, lastUsedAt }]
}
```

### 7.4 conversationView

```typescript
{
  conversation: { id, title, source, createdAt }
  messages: [{ id, role, contentText, createdAt }]
  approvals: [{ id, status, toolName, toolInput, reason }]
  automations: [{ id, name, instruction, intervalMinutes, status, nextRunAt }]
  activeRun: { status, phase } | null
  lastFailedRun: { lastError } | null
}
```

### 7.5 streamingMessage

```typescript
{
  text: string    // Text accumulated from SSE delta events
  runId: string   // Associated Run ID
} | null
```

### 7.6 admin bootstrap data

```typescript
{
  overview: { userCount, pendingApprovalCount, automationCount, toolPolicyCount, filePolicyCount, protectionRuleCount, toolCatalogCount }
  users: [{ id, loginName, displayName, role, status, authSource, systemUserType, toolPolicy: { id, name }, filePolicy: { id, name } }]
  toolPolicies: [{ id, name, description, isSystem, tools: string[], toolDetails: [{ name, riskLevel }] }]
  filePolicies: [{ id, name, description, isSystem, roots: [{ id, scope, rootPath, pathType }] }]
  protectionRules: [{ id, pattern, patternType, effect, enabled, scope, note }]
  approvals: [{ id, status, toolName, toolInput, reason, requestedAt }]
  automations: [{ id, name, instruction, intervalMinutes, status, ownerUserId, nextRunAt }]
  tools: [{ name, description, pluginName, source, mcpServerName, riskLevel, inputSchema }]
  mcpServers: [{ name, state, lastError }]
  mcpServerConfigs: [{ name, config, state, lastError, toolCount }]
  skills: [{ name, description, prompt }]
}
```

---

## 8. Business Rules and Constraints

### 8.1 Root User Constraints

- Password cannot be changed (managed by ADMIN_RUNTIME_PASSWORD)
- Status cannot be changed (always active)
- Identity (loginName, displayName, role) cannot be changed
- Cannot be deleted
- Tool/file policy assignment is allowed

### 8.2 System Policy Constraints

- Policies with `isSystem === true` cannot be edited or deleted
- Root addition/deletion is also not allowed

### 8.3 Policy Deletion Constraints

- If users are assigned, replacement policy selection is required
- If no users are assigned, immediate deletion is possible

### 8.4 Remote Account Constraints

- Accounts with `authSource !== 'local'` cannot be deleted from the admin console
- Password changes are allowed

### 8.5 Automation Constraints

- Minimum value for `intervalMinutes`: 5
- Cannot be created if no conversation is selected

### 8.6 MCP Connection Polling

- Polling starts after creation/reconnection/update
- 2-second intervals, max 8 attempts (16 seconds)
- Stops on `ready` or `failed`

---

## 9. Files That Must Not Be Changed

Files that **must not be changed** when rebuilding the UI:

- `src/admin-web/src/lib/api.js` --- API communication layer (use as-is)
- `src/admin-web/src/lib/axios.js` --- axios instance + interceptors
- `src/admin-web/src/lib/sse.js` --- SSE client (use as-is)
- `src/admin-web/src/lib/utils.js` --- `cn()` utility
- `src/admin-web/src/i18n/` --- Translation files (can be utilized in the future)
- All backend code (everything in `src/` except `admin-web/`)

---

## 10. Improvement Notes (Reference for Rebuild)

> These are characteristics of the current implementation that may be improved during a rebuild.

1. **i18n is not utilized**: Context/translations exist but each page uses English text directly
2. **Large custom hook**: `useWorkspace.js` holds many responsibilities. Splitting SSE management, API calls, and state operations would be desirable
3. **Form validation**: No client-side validation (everything relies on the server)
4. **select elements**: Uses native `<select>`. Could be replaced with custom dropdowns
5. **SSE reconnection**: Does not auto-reconnect on error, falls back to polling. Room for exponential backoff reconnection
