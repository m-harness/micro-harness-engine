English | [日本語](../ja/ui-functional-spec.md)

# microHarnessEngine Web UI Functional Specification

> **Purpose**: A specification to ensure no functionality is lost when completely rebuilding the UI appearance.
> The premise is that the API and logic remain unchanged. The tech stack continues with React + Tailwind CSS + Vite.

---

## 1. Application Structure

### 1.1 Two Independent Screens

| Screen | Path | Authentication | Purpose |
|--------|------|----------------|---------|
| **User Workspace** | `/` | User session (`microharnessengine_session` cookie) | Chat, approvals, automations, API token management |
| **Admin Console** | `/admin` | Admin session (`microharnessengine_admin_session` cookie) | User provisioning, policy management, operational monitoring |

- Routing is determined by `window.location.pathname` (react-router-dom is not used)
- When on `/admin`, the `AdminConsole` component is rendered entirely
- Otherwise, the `App` component (User Workspace) is rendered

### 1.2 Entry Point

```
main.jsx → <App />
  ├─ pathname is /admin → <AdminConsole />
  └─ otherwise → Workspace UI
```

---

## 2. Common Patterns

### 2.1 State Management

- **No external libraries**: Everything uses only `useState`
- **No global store**: All state is held within components
- Form values are also individually managed with `useState` (no form libraries used)

### 2.2 API Communication Layer (`lib/api.js`)

```
request(path, { method, body, csrfToken, headers })
```

- Uses `fetch` with `credentials: 'include'` (automatic cookie sending)
- Mutations (POST/PATCH/DELETE) include the `x-csrf-token` header
- Responses are in `{ ok: true, data: {...} }` format, returning `data`
- On error: `throw new Error(payload.error)` → caught by `runAction` at the call site

### 2.3 Loading Management (`busyKey` Pattern)

```javascript
const [busyKey, setBusyKey] = useState('')

async function runAction(key, callback) {
  setBusyKey(key)
  try { await callback() }
  catch (error) { showFlash(error.message, 'error') }
  finally { setBusyKey('') }
}
```

- Each button uses `disabled={busyKey === 'key-name'}` to prevent double submission
- Button labels switch to "Sending..." etc. based on `busyKey`

### 2.4 Flash Messages (Toast Notifications)

```javascript
const [flash, setFlash] = useState(null) // { message, kind }
```

- `kind`: `'info'` (teal-based) / `'error'` (rose-based)
- Auto-cleared after 4200ms (`useEffect` + `setTimeout`)
- Displayed at the top of the screen

### 2.5 Date Formatting

```javascript
new Intl.DateTimeFormat('ja-JP', {
  month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit'
}).format(new Date(value))
```

- Displays `'Not yet'` when value is absent

### 2.6 Status Badge (`Pill` Component)

Status string to color mapping:

| Status | Color Scheme |
|--------|-------------|
| `active`, `completed`, `approved` | emerald (green) |
| `queued`, `running`, `waiting_approval`, `pending` | amber (yellow) |
| `recovering` | orange |
| `paused` | slate (gray) |
| `denied`, `failed`, `disabled`, `deleted` | rose (red) |
| Other | slate (gray) default |

### 2.7 Confirmation Dialogs

- Deletion operations use `window.confirm()` for confirmation (not custom modals)
- Only policy deletion uses `DeletePolicyDialog` (custom modal)

### 2.8 i18n (Internationalization)

- `i18n/translations.js` contains `en` / `ja` translation dictionaries
- `i18n/context.jsx` contains `I18nProvider` + `useI18n` hook
- Locale is saved in `localStorage` (`microharnessengine-admin-web.locale`)
- Browser language is auto-detected
- **Note**: The current App.jsx/AdminConsole.jsx uses English text directly, and the i18n context is not in use

---

## 3. User Workspace (`App.jsx`)

### 3.1 Lifecycle

```
Mount
  └─ hydrate()
       ├─ api.getAuthState() → update authState
       ├─ user exists → loadWorkspace()
       │    ├─ api.getBootstrap() → conversations, apiTokens
       │    └─ loadConversation(id) → conversationView
       └─ no user → display login screen

After authentication, loadWorkspace() is polled every 4000ms
```

### 3.2 Screen Transitions

```
[Initializing] → Display "Loading workspace..."
[Unauthenticated] → Login screen
[Authenticated] → Workspace (3-column layout)
```

### 3.3 Login Screen

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
- Submit: `api.login(loginForm)` → `hydrate()`

**Admin Info Card**:
- Title: "Admin-managed accounts"
- Code block: displays admin plane URL and CLI commands

### 3.4 Workspace Screen

**Overall Layout**: Header + 3-column grid (`xl:grid-cols-[300px_minmax(0,1fr)_360px]`)

#### 3.4.1 Header

- Brand label: "microHarnessEngine Workspace"
- User display name, @loginName, role
- Status Pill: activeRun status or "ready"
- Buttons: "New conversation", "Log out"

#### 3.4.2 Left Column: Session List

**Card Title**: "Sessions"

**When 0 conversations**: `EmptyState` component
- Title: "No conversations yet"
- Action button: "Start first chat"

**Conversation List**: Each conversation is a button element
- Selected: primary color background + white text + shadow
- Unselected: white background + hover effect
- Displayed information:
  - `title`
  - `source` (web/slack/discord)
  - Pending approval count badge (when `pendingApprovalCount > 0`)
  - Last message timestamp (`lastMessageAt` or `createdAt`)
  - Active run status (`activeRunStatus`)

**Behavior**: Click triggers `handleSelectConversation(id)` → `loadConversation(id)`

#### 3.4.3 Center Column: Message Thread

**Card Header**:
- Title: selected conversation's title or "Conversation"
- Description: source + creation date, or guidance when nothing is selected

**Message Display Area** (scrollable):
- No conversation selected: `EmptyState` "No session selected"
- 0 messages: `EmptyState` "This conversation is ready"
- Message list:
  - `role === 'user'`: right-aligned, primary color background, white text, only bottom-right corner has small border-radius
  - `role === 'assistant'`: left-aligned, white background + border, only bottom-left corner has small border-radius
  - `role === 'tool'`: center-aligned, dashed amber border, mono font
  - Each message has: label ("You"/"Agent"), contentText, createdAt

**Input Area** (separated by border-t):
- Active run display: status Pill + phase
- Failed run error: "Last run failed: {error}"
- Textarea: min-height 8rem
- Send button: "Send message" (while loading: "Sending...")
- Supplementary text: "Approvals and automation replies return to the same linked chat surface."

**Send Behavior**:
1. If `messageDraft.trim()` is empty, do nothing
2. If no `selectedConversationId`, create a new conversation
3. `api.postConversationMessage()` → `setMessageDraft('')` → `loadWorkspace()`

#### 3.4.4 Right Column: Sidebar (3 Cards)

##### (A) Approvals Card

**Title**: "Approvals"
**Description**: "Human decisions resume the paused run for this user only."

**When 0 approvals**: Text "No pending approvals in this session."

**Approval List**: Each approval item
- Status Pill + tool name (uppercase)
- Reason text (`reason`)
- Tool input JSON preview (`JSON.stringify(toolInput, null, 2)`)
- Buttons: "Approve", "Deny"
- Behavior: `api.decideApproval(id, { decision })` → `loadWorkspace()`

##### (B) Automations Card

**Title**: "Automations"

**Creation Form** (always visible):
- `name` (Input, placeholder: "Automation name")
- `instruction` (Textarea, min-height 7rem, placeholder: "What should this automation do?")
- `intervalMinutes` (Input type=number, min=5, placeholder: "60")
- Button: "Create"
- Behavior: `api.createAutomation()` → clear form → `loadWorkspace()`
- Prerequisite: flash error if no conversation is selected

**Automation List**: Each item
- Name + interval display (`formatInterval`)
- Status Pill
- Instruction text (`instruction`, whitespace-pre-wrap)
- Next run time
- Button group:
  - "Run now": `api.runAutomationNow()`
  - "Pause"/"Resume": `api.updateAutomationStatus()` (pause if active, activate if paused)
  - "Delete": `window.confirm()` → `api.deleteAutomation()`

**Interval Display Rules**:
- None → "Manual"
- Less than 60 → "Every {n} min"
- Divisible by 60 → "Every {n} hr"
- Other → "Every {n} min"

##### (C) API Access Card

**Title**: "API access"

**Token Display** (when `revealedToken` exists):
- "Copy this token now" + teal background code block

**Creation Form**:
- `newTokenName` (Input, initial value: "Primary integration token")
- Button: "Create"
- Behavior: `api.createToken()` → `setRevealedToken(token)` → `loadWorkspace()`

**Token List**: Each token
- Name, creation time, last used time
- Button: "Revoke" (`window.confirm()` → `api.revokeToken()`)

**When 0 tokens**: Text "No personal access tokens yet."

### 3.5 Logout Behavior

1. `api.logout()`
2. Clear `revealedToken`
3. Clear `messageDraft`
4. Reset state with `hydrate()`

---

## 4. Admin Console (`AdminConsole.jsx`)

### 4.1 Lifecycle

```
Mount
  └─ loadAdmin()
       ├─ api.getAdminAuthState() → authState
       ├─ unauthenticated → data = null
       └─ authenticated → api.getAdminBootstrap() → data
```

- No polling like the User Workspace (manual refresh only)
- `loadAdmin()` re-fetches data after every mutation

### 4.2 Authentication Screen

**Layout**: Center-aligned (`max-w-3xl`) card

**Card Contents**:
- Title: "Admin Console"
- Description: explanation of root account
- Warning banner (amber) when admin is not enabled
- Form:
  - `loginName` (initial value: "root")
  - `password`
  - Button: "Enter admin console" (disabled if `adminEnabled` is false)
- Behavior: `api.adminLogin()` → clear password → `loadAdmin()`

### 4.3 Main Screen

**Overall Layout**: Header + tab content

#### Header
- Label: "Admin Plane"
- Title: "Policy and Operations Console"
- Description text
- Logged-in user display: "@{loginName}"
- Logout button
- Tab navigation (`SectionTabs`)

#### Tab List

```
overview | users | tool-policies | file-policies | protection-rules |
approvals | automations | tools | skills | mcp-servers
```

- Each tab is a button element, displayed capitalized
- Selected: dark background (`#17332f`) + light text
- Unselected: white-based background + hover effect

### 4.4 Overview Tab

**Layout**: Grid (`md:grid-cols-2 xl:grid-cols-3`)

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

**Layout**: 2-column grid (`xl:grid-cols-[1.1fr_0.9fr]`)

#### Left: User List

**Title**: "Users"

**Each User Card**:
- Display name + @loginName
- Status Pill group: status, role, authSource, ("protected root" if root)
- Tool policy selector (`<select>`): changes are applied immediately → `api.adminAssignPolicies()`
- File policy selector (`<select>`): changes are applied immediately → `api.adminAssignPolicies()`
- Password change row: Input + "Set password" button
  - Disabled for root user (placeholder: "Managed by ADMIN_RUNTIME_PASSWORD")
- Status toggle button: "Disable"/"Enable"
  - Disabled for root user
- Delete button: "Delete"
  - Disabled for root or remote accounts
  - `window.confirm()` → `api.adminDeleteUser()`
- Root user description text
- Remote account description text

**Immediate Policy Change Reflection**:
- Directly calls `api.adminAssignPolicies()` on select's `onChange`
- The other policy ID retains its current value

#### Right: User Creation Form

**Title**: "Create user"

- `loginName` (Input, placeholder: "login name")
- `displayName` (Input, placeholder: "display name")
- `password` (Input type=password, placeholder: "initial password")
- `role` (select: "user" / "admin")
- Button: "Create user"
- Behavior: `api.adminCreateUser()` → clear form → `loadAdmin()`

### 4.6 Tool Policies Tab

**Layout**: 2-column grid (`xl:grid-cols-[1.05fr_0.95fr]`)

#### Left: Policy List

**Title**: "Tool policies"

**Each Policy Card**:
- Name + description
- Pill: "system" or "custom"
- Custom only: "Edit" button, "Delete" button
- Tool list: each tool name + RiskPill (inline)

**Edit**: Opens the tool policy edit modal
**Delete**: Opens `DeletePolicyDialog` (with replacement policy selection)

#### Right: Policy Creation Form

**Title**: "Create tool policy"

- If MCP servers exist: connection status legend (color descriptions for ready/connecting/failed/disconnected)
- `name` (Input)
- `description` (Input)
- Tool checkbox list (max-h 24rem scrollable):
  - Each tool: checkbox + name + MCP Badge (if source is mcp) + description + RiskPill
- Button: "Create tool policy"

#### Modal: Tool Policy Edit

- Fixed overlay (`z-50`, semi-transparent black background)
- Card (max-w-2xl)
- `name`, `description` Inputs
- Tool checkbox list (same as creation form)
- "Cancel", "Save changes" buttons

#### Modal: Tool Policy Delete (`DeletePolicyDialog`)

- If users are assigned: replacement policy selection is required
- If no assignments: immediate deletion is possible
- "Cancel", "Delete" buttons

### 4.7 File Policies Tab

**Layout**: 2-column grid (`xl:grid-cols-[1.05fr_0.95fr]`)

#### Left: Policy List

**Header**: "File policies" + "Create file policy" button (opens modal)

**Each Policy Card**:
- Name + description
- Pill: "system" / "custom"
- Custom only: "Edit policy", "Delete policy" buttons
- Root list: displayed in `scope:pathType:rootPath` format + "Delete" button
- Root addition row (custom only):
  - `rootPath` (Input)
  - `pathType` (select: "dir" / "file")
  - "Choose path" button (opens file browser modal)
  - "Add root" button (scope is fixed as "absolute")

#### Right: Probe Path Card

**Title**: "Probe path"

- Path input (Input)
- "Probe" button → `api.adminProbePath()`
- Result display:
  - Pill: "visible to server" / "not found"
  - Pill: "already inside workspace" / "outside workspace"
  - Pill: pathType
  - Text: resolved path, explanation of meaning, workspace check result

#### Modal: File Policy Create

- `name`, `description` Inputs
- "Cancel", "Create file policy" buttons

#### Modal: File Policy Edit

- `name`, `description` Inputs
- "Cancel", "Save changes" buttons

#### Modal: File Browser (`FileBrowser`)

- max-w-5xl, max-h-[90vh]
- "Close" button
- `FileBrowser` component:
  - Current path display
  - Node list: each node
    - Name + kind Badge + workspace Badge
    - absolutePath display
    - Directory: "Open" (expand subdirectory), "Add directory"
    - File: "Add file"
  - "Add" triggers `handleAddRootFromBrowser()`:
    - If inside workspace: scope='workspace' + relative path
    - If outside workspace: scope='absolute' + absolute path

#### Modal: File Policy Delete (`DeletePolicyDialog`)

- Same pattern as tool policy deletion

### 4.8 Protection Rules Tab

**Layout**: 2-column grid (`xl:grid-cols-[1.1fr_0.9fr]`)

#### Left: Rule List

**Title**: "Protection rules"

**Warning Banner** (amber):
- Applied to workspace-relative paths. External paths are covered by `**` globs.

**Each Rule Card**:
- Pattern (mono font) + note
- Pill group: patternType, scope (system only), enabled state ("deny"/"disabled")
- "Enable"/"Disable" button → `api.adminToggleProtectionRule()`
- "Delete" button (non-system only) → `window.confirm()` → `api.adminDeleteProtectionRule()`

#### Right Top: Rule Creation Card

**Title**: "Add protection rule"

- `kind` (select):
  - "File (exact match)" = `path`
  - "Folder (directory tree)" = `dir`
  - "Pattern (wildcard)" = `glob`
- `pattern` (Input, placeholder changes based on kind)
- Description text
- Button: "Create protection rule"

#### Right Bottom: Path Inspection Card

**Title**: "Inspect path"

- Path input (Input, placeholder: "e.g. .env or src/secrets.json")
- "Inspect" button → `api.adminInspectProtectionPath()`
- Result display:
  - Path (mono font)
  - Pill: "Protected" (denied color) / "Not protected" (active color)
  - Matched rule pattern (if any)

### 4.9 Approvals Tab

**Title**: "Approvals"
**Description**: "Global queue for runs that are waiting on a human decision."

**Approval List**: Each approval item
- Pill(status) + toolName + timestamp
- Reason text
- Tool input JSON (dark background preview)
- "Approve", "Deny" buttons → `api.adminDecideApproval()`

**When 0 items**: "No pending approvals."

### 4.10 Automations Tab

**Title**: "Automations"
**Description**: "Created by chat. Admin can inspect, pause, or delete in emergencies."

**List**: Each automation
- Name + owner ID + next run time
- Status Pill
- Instruction text (whitespace-pre-wrap)
- "Pause" button → `api.adminPauseAutomation()` (pause only)
- "Delete" button → `api.adminDeleteAutomation()`

**When 0 items**: "No active automations."

### 4.11 Tools Tab

**Title**: "Tool catalog"
**Description**: "Reference list for building tool policies."

MCP connection status legend (when MCP servers exist)

**Tool List**: Each tool
- Name + McpBadge (if source is mcp)
- McpStatusPill (MCP tools only: ready/connecting/failed/disconnected)
- RiskPill
- Description
- input_schema JSON preview (dark background, formatted)

### 4.12 Skills Tab

**Layout**: 2-column grid (`xl:grid-cols-[1.1fr_0.9fr]`)

#### Left: Skill List

**Title**: "Skills"

**Each Skill Card**:
- Name + description
- "Edit" button → expand inline editing
- "Delete" button → `window.confirm()` → `api.adminDeleteSkill()`

**Inline Editing** (expands within the card of the skill being edited):
- `description` (Input)
- `prompt` (Textarea, min-height 12rem)
- "Save" → `api.adminUpdateSkill()`, "Cancel"

#### Right: Skill Creation Card

**Title**: "Create skill"
**Description**: "Name must be lowercase letters, numbers, and underscores only."

- `name` (Input, placeholder: "e.g. code_review")
- `description` (Input)
- `prompt` (Textarea, min-height 14rem)
- Button: "Create skill"

### 4.13 MCP Servers Tab

**Layout**: 2-column grid (`xl:grid-cols-[1.1fr_0.9fr]`)

#### Left: Server List

**Title**: "MCP Servers"

**Each Server Card**:
- Name + protocol Pill (http=blue, stdio=purple)
- Connection details: URL for http, command + args for stdio
- Connection state Pill + tool count
- Error display on failure (rose background)
- Buttons: "Edit"/"Cancel", "Reconnect", "Delete"

**Inline Editing** (expanded):
- `mode` (select: stdio/http)
- stdio mode: command, args (comma-separated), env (KeyValueEditor)
- http mode: url, headers (KeyValueEditor)
- "Save changes" button

**Reconnect Behavior**:
1. `api.adminReconnectMcpServer()`
2. Update data with `loadAdmin()`
3. `pollUntilMcpSettled()`: poll every 2 seconds, max 8 attempts
   - Until state becomes 'ready' or 'failed'

#### Right: Server Addition Card

**Title**: "Add MCP server"

- `name` (Input)
- `mode` (select: "stdio (local process)" / "http (remote server)")
- stdio: `command`, `args` (comma-separated), `env` (KeyValueEditor, for secrets)
- http: `url`, `headers` (KeyValueEditor, for secrets)
- Button: "Add server" (while loading: "Connecting...")

**KeyValueEditor** Component:
- Manages an array of key-value pairs
- Each row: key Input + value Input + delete button (x)
- Add button: "+ Add"
- If valuePlaceholder is "Value (secret)", type=password

**Config Construction Logic**:
```javascript
// stdio
config = { command }
if (args) config.args = args.split(',').map(s => s.trim()).filter(Boolean)
if (env) config.env = kvPairsToObject(envPairs)

// http
config = { url }
if (headers) config.headers = kvPairsToObject(headerPairs)
```

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
- min-height: 8rem
- Same focus style as Input

### 5.5 Label

- Form label

### 5.6 Badge

```
tones: default | success | warn | danger
```

### 5.7 Table / THead / TBody / TR / TH / TD

- Table components (currently unused but exist)

### 5.8 DeletePolicyDialog

**Props**:
- `open`: visibility flag
- `title`, `description`: dialog description
- `policies`: array of replacement candidate policies
- `value`: selected replacement policy ID
- `replacementRequired`: whether users are assigned
- `replacementLabel`: additional description text
- `onChange(policyId)`, `onCancel()`, `onConfirm()`
- `t(key)`: translation function

### 5.9 FileBrowser

**Props**:
- `data`: `{ currentPath, nodes[] }`
- `onBrowse(targetPath)`: callback for directory expansion
- `onAddRoot(absolutePath, pathType)`: callback for path addition
- `t(key)`: translation function

### 5.10 ToolCatalogExplorer

**Props**:
- `plugins`: plugin array `[{ name, description, tools[] }]`
- `selectedTools`: Set of selected tool names (nullable)
- `onToggleTool(toolName)`: tool toggle callback
- `t(key)`: translation function

**Functionality**: Collapsible via `<details>` elements, displays tool argument schemas

(Note: Currently AdminConsole uses inline checkbox lists, and ToolCatalogExplorer is not directly used)

### 5.11 EmptyState

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

### 6.4 Approvals

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/approvals/:id/decision` | Yes | User approve/deny |
| POST | `/api/admin/approvals/:id/decision` | Yes | Admin approve/deny |

### 6.5 Automations

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/conversations/:id/automations` | Yes | Create |
| PATCH | `/api/automations/:id` | Yes | Change status |
| DELETE | `/api/automations/:id` | Yes | Delete |
| POST | `/api/automations/:id/run-now` | Yes | Run immediately |
| PATCH | `/api/admin/automations/:id` | Yes | Admin pause |
| DELETE | `/api/admin/automations/:id` | Yes | Admin delete |

### 6.6 API Tokens

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/me/tokens` | Yes | Create token |
| DELETE | `/api/me/tokens/:id` | Yes | Revoke token |

### 6.7 User Management

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/users` | Yes | Create user |
| PATCH | `/api/admin/users/:id` | Yes | Update user |
| DELETE | `/api/admin/users/:id` | Yes | Delete user |
| POST | `/api/admin/users/:id/password` | Yes | Set password |
| PATCH | `/api/admin/users/:id/policies` | Yes | Assign policies |

### 6.8 Tool Policies

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/tool-policies` | Yes | Create |
| PATCH | `/api/admin/tool-policies/:id` | Yes | Update |
| DELETE | `/api/admin/tool-policies/:id` | Yes | Delete (body: replacementPolicyId) |

### 6.9 File Policies

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/file-policies` | Yes | Create |
| PATCH | `/api/admin/file-policies/:id` | Yes | Update |
| DELETE | `/api/admin/file-policies/:id` | Yes | Delete (body: replacementPolicyId) |
| POST | `/api/admin/file-policies/:id/roots` | Yes | Add root |
| DELETE | `/api/admin/file-policies/:id/roots/:rootId` | Yes | Delete root |

### 6.10 File System

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| GET | `/api/admin/fs/probe?path=` | No | Probe path |
| GET | `/api/admin/fs/browse?path=` | No | Browse directory |

### 6.11 Protection Rules

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/protection-rules` | Yes | Create |
| PATCH | `/api/admin/protection-rules/:id` | Yes | Enable/disable toggle |
| DELETE | `/api/admin/protection-rules/:id` | Yes | Delete |
| POST | `/api/admin/protection-rules/inspect` | Yes | Inspect path protection |

### 6.12 Skills

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| POST | `/api/admin/skills` | Yes | Create |
| PATCH | `/api/admin/skills/:name` | Yes | Update |
| DELETE | `/api/admin/skills/:name` | Yes | Delete |

### 6.13 MCP Servers

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

### 7.5 admin bootstrap data

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

- `src/admin-web/src/lib/api.js` -- API communication layer (use as-is)
- `src/admin-web/src/lib/utils.js` -- `cn()` utility
- `src/admin-web/src/i18n/` -- Translation files (can be utilized in the future)
- All backend code (everything in `src/` except `admin-web/`)

---

## 10. Improvement Notes (Reference for Rebuild)

> These are characteristics of the current implementation that may be improved during a rebuild.

1. **react-router-dom is unused**: Installed but substituted with `window.location.pathname`. Introducing routing would enable URL-based admin tabs
2. **i18n is not utilized**: Context/translations exist but App.jsx/AdminConsole.jsx uses English text directly
3. **Polling-based**: Full refresh every 4 seconds. Could be optimized with WebSocket/SSE
4. **Monolithic components**: AdminConsole.jsx is 1559 lines. Splitting by tab would be desirable
5. **Form validation**: No client-side validation (everything relies on the server)
6. **select elements**: Uses native `<select>`. Could be replaced with custom dropdowns
