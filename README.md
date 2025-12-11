# @t09tanaka/ts-rename-helper-mcp

An MCP server that provides TypeScript symbol renaming and file/directory moves for coding agents.

This exists as a **helper bridge**: most current code agents can’t talk to the TypeScript Language Service (LSP) directly, so even a simple rename can be slow and error-prone.  
`ts-rename-helper-mcp` gives the agent compiler-grade rename/move plans without touching your filesystem.

> ⚠️ This project is intentionally narrow in scope and may become obsolete once agents can use LSPs directly.

---

## Features

- **Type-safe symbol renaming**
  - Uses the TypeScript Language Service to compute all affected locations
- **File move / rename planning**
  - Returns edits for updated import paths across the project
- **Directory move / rename planning**
  - Recursively plans file moves and import updates for all files under a directory
- **Read-only by design**
  - MCP tools only return “edit plans” and suggested file moves  
    → actual file writes are left to your editor/agent

---

## Installation

Project-local install (recommended):

```bash
npm install --save-dev @t09tanaka/ts-rename-helper-mcp
# or
pnpm add -D @t09tanaka/ts-rename-helper-mcp
# or
yarn add -D @t09tanaka/ts-rename-helper-mcp
```

Requirements:

- Node.js 18+
- A TypeScript project with a valid `tsconfig.json` at or under `projectRoot`

---

## Usage

### MCP configuration example

Example for an MCP client that uses a JSON config (e.g. Claude Desktop style):

```jsonc
{
  "mcpServers": {
    "ts-rename-helper": {
      "command": "npx",
      "args": ["-y", "@t09tanaka/ts-rename-helper-mcp"],
      "env": {
        // optional: override default working directory
        // "TS_RENAME_HELPER_PROJECT_ROOT": "/absolute/path/to/your/project"
      },
    },
  },
}
```

The server will typically run in the current working directory of the client process.
Agents should pass `projectRoot` explicitly in tool calls if they work with multiple repos.

---

## Tools

This MCP server exposes three tools:

1. `planRenameSymbol`
2. `planFileMove`
3. `planDirectoryMove`

All tools are **pure**: they never modify files, they only return structured edit plans.

### 1. `planRenameSymbol`

Compute all edits needed to rename a symbol at a specific position.

**Input**

```jsonc
{
  "projectRoot": "/absolute/path/to/project",
  "filePath": "src/foo/bar.ts",
  "line": 12, // 0-based
  "character": 8, // 0-based
  "newName": "fetchUserProfiles",
  "findInStrings": false,
  "findInComments": false,
}
```

**Output**

```jsonc
{
  "canRename": true,
  "edits": [
    {
      "filePath": "/absolute/path/to/project/src/foo/bar.ts",
      "textEdits": [
        {
          "range": {
            "start": { "line": 12, "character": 4 },
            "end": { "line": 12, "character": 20 },
          },
          "newText": "fetchUserProfiles",
        },
      ],
    },
    {
      "filePath": "/absolute/path/to/project/src/usage.ts",
      "textEdits": [
        {
          "range": {
            "start": { "line": 5, "character": 16 },
            "end": { "line": 5, "character": 32 },
          },
          "newText": "fetchUserProfiles",
        },
      ],
    },
  ],
}
```

If the symbol cannot be renamed:

```jsonc
{
  "canRename": false,
  "reason": "This symbol cannot be renamed.",
}
```

**Notes**

- `line` / `character` are **0-based** (same as LSP).
- `filePath` may be relative in input, but output paths are absolute.
- Agents should:

  1. Read each file
  2. Apply `textEdits` in a stable order (typically reverse-sorted by position)
  3. Write updated content back

---

### 2. `planFileMove`

Plan a file move/rename and compute all necessary import updates.

**Input**

```jsonc
{
  "projectRoot": "/absolute/path/to/project",
  "oldPath": "src/feature/user/api.ts",
  "newPath": "src/features/user/api.ts",
}
```

**Output**

```jsonc
{
  "edits": [
    {
      "filePath": "/absolute/path/to/project/src/index.ts",
      "textEdits": [
        {
          "range": {
            "start": { "line": 3, "character": 0 },
            "end": { "line": 3, "character": 50 },
          },
          "newText": "export * from './features/user/api';",
        },
      ],
    },
  ],
  "fsMoves": [
    {
      "from": "/absolute/path/to/project/src/feature/user/api.ts",
      "to": "/absolute/path/to/project/src/features/user/api.ts",
    },
  ],
}
```

**Notes**

- `fsMoves` is only a **suggestion** – the agent/editor should perform the actual move.
- `edits` should be applied after the move so that imports point to the new path.

---

### 3. `planDirectoryMove`

Plan a directory move/rename and compute all necessary import updates for files under that directory.

**Input**

```jsonc
{
  "projectRoot": "/absolute/path/to/project",
  "oldDir": "src/feature/auth",
  "newDir": "src/features/auth",
}
```

**Output**

```jsonc
{
  "edits": [
    {
      "filePath": "/absolute/path/to/project/src/router.tsx",
      "textEdits": [
        {
          "range": {
            "start": { "line": 10, "character": 20 },
            "end": { "line": 10, "character": 49 },
          },
          "newText": "'./features/auth/routes'",
        },
      ],
    },
  ],
  "fsMoves": [
    {
      "from": "/absolute/path/to/project/src/feature/auth/index.ts",
      "to": "/absolute/path/to/project/src/features/auth/index.ts",
    },
    {
      "from": "/absolute/path/to/project/src/feature/auth/hooks.ts",
      "to": "/absolute/path/to/project/src/features/auth/hooks.ts",
    },
  ],
}
```

**Notes**

- All TypeScript / TSX files under `oldDir` are treated as candidates for moves.
- Internally this is typically implemented as repeated `getEditsForFileRename` calls.

---

## Typical agent flow

A coding agent integrating this MCP server would usually:

1. Decide on an operation:

   - rename a symbol, or
   - move a file/directory

2. Call the corresponding tool (`planRenameSymbol`, `planFileMove`, `planDirectoryMove`)
3. Inspect the returned `edits` and `fsMoves`
4. Apply `fsMoves` using its own filesystem tools
5. Apply `edits` to the affected files
6. Optionally run `tsc` or tests to validate

---

## Limitations

- **TypeScript only**
  JavaScript-only projects without `tsconfig.json` are not currently targeted.
- **Project model is created per call** (depending on implementation)
  For extremely large monorepos you may want to cache the server or run it close to the project root.
- **No actual file I/O via MCP**
  This server never writes to disk; agents must handle file operations.

---

## License

MIT © 2025 Takuto Tanaka
