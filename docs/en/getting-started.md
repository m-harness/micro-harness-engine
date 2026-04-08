English | [日本語](../ja/getting-started.md)

# Getting Started

A guide from installing microHarnessEngine to your first chat.

---

## Prerequisites

- **Node.js** 18 or higher
- **npm**
- One of the following LLM API keys:
  - Anthropic API Key (`sk-ant-...`)
  - OpenAI API Key (`sk-...`)
  - Google Gemini API Key

---

## Installation

```bash
git clone https://github.com/m-harness/micro-harness-engine.git
cd micro-harness-engine
npm install
```

Build the admin panel (first time only):

```bash
npm run build:web
```

---

## Environment Setup

Create a `.env` file in the project root.

### Minimal Configuration

```env
# LLM Provider (required)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# Admin panel password (required)
ADMIN_RUNTIME_PASSWORD=your-secure-password-here
```

### Using OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxx
```

### Using Gemini

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=xxxxx
```

See [Configuration](./configuration.md) for all available settings.

---

## Starting the Server

### Production Mode

```bash
npm run build:web   # Build the admin panel (first time only)
npm start
```

Once started, the following endpoints become available:

| URL | Purpose |
|---|---|
| `http://localhost:4310/` | Chat UI |
| `http://localhost:4310/admin` | Admin panel |
| `http://localhost:4310/api/health` | Health check |

The port can be changed via the `API_PORT` environment variable (default: `4310`).

### Development Mode

You can start the backend API and Vite dev server simultaneously with a single command:

```bash
npm run dev:full
```

| URL | Purpose |
|---|---|
| `http://localhost:4173/` | Web UI (Vite HMR enabled, API auto-proxied) |
| `http://localhost:4310/` | Backend API (auto-reloads on file changes) |

- Backend: Auto-reloads when files under `src/` are changed
- Frontend: Hot-reloads via Vite HMR
- API requests are forwarded to `localhost:4310` through Vite's proxy

---

## Initial Setup

### 1. Log in to the Admin Panel

Navigate to `http://localhost:4310/admin` and log in with the following credentials:

- **Login Name**: `root`
- **Password**: The `ADMIN_RUNTIME_PASSWORD` value set in your `.env` file

`root` is a special administrator account automatically created by the system. It cannot be deleted or disabled.

### 2. Create a User

Create a new user from the **Users** section.

- **Login Name**: Alphanumeric characters, hyphens, and underscores (2-32 characters)
- **Display Name**: The name displayed in the UI
- **Password**: 12 characters or more
- **Role**: `user` or `admin`

### 3. Create a Tool Policy

In the **Tool Policies** section, create a policy selecting the tools you want to allow.

Example: "Read-only" policy
- `list_files` -- List files
- `read_file` -- Read files
- `glob` -- Pattern search
- `grep` -- Content search

Example: "Developer" policy
- All of the above + `write_file`, `edit_file`, `multi_edit_file`, `make_dir`, `move_file`

> The system comes with two built-in system policies: "Default (deny all)" and "System All Tools".
> - **Default**: Denies all tool usage (default for new users)
> - **System All Tools**: Allows all registered tools (assigned to the root user)

### 4. Create a File Policy (Optional)

Only create this if you need access to paths outside the project directory.

The default File Policy allows access to **the workspace (under the project root) only**.

To add external paths:
- **Scope**: `absolute`
- **Root Path**: `/var/log/myapp` (the path to grant access to)
- **Path Type**: `dir` or `file`

### 5. Assign Policies to Users

In the **Users** section, assign to each user:
- One Tool Policy
- One File Policy

### 6. Start Chatting

Navigate to `http://localhost:4310/` and log in with the user you created.

Create a new conversation and send a message -- the AI assistant will respond. Only tools permitted by the user's policy will be used.

---

## Verifying Operation

### Health Check

```bash
curl http://localhost:4310/api/health
```

```json
{
  "status": "ok",
  "provider": "anthropic",
  "projectRoot": "/path/to/your/project"
}
```

### Creating Users from the CLI

You can also manage users from the CLI without the admin panel:

```bash
npm run root:cli -- create-user --username testuser --password "securepassword123"
npm run root:cli -- list-users
```

---

## Next Steps

- [Architecture](./architecture.md) -- Understand the overall system architecture
- [Security Model](./security.md) -- Understand the security design
- [Policy Guide](./policy-guide.md) -- Learn more about policy configuration
- [Channels](./channels.md) -- Connect Slack / Discord
- [Configuration](./configuration.md) -- Review all configuration options
