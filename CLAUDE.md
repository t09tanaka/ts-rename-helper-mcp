# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ts-rename-helper-mcp is an MCP (Model Context Protocol) server that provides TypeScript symbol renaming and file/directory move planning for coding agents. It acts as a bridge between agents and the TypeScript Language Service, returning compiler-grade edit plans without modifying the filesystem.

**Key design principles:**

- Read-only by design: tools return "edit plans" only, never write to disk
- Pure functions: all three tools are side-effect free
- Position convention: line/character are 0-based (LSP standard)

## MCP Tools

The server exposes three tools:

1. **planRenameSymbol** - Compute edits to rename a symbol at a specific position
2. **planFileMove** - Plan file move/rename with import path updates
3. **planDirectoryMove** - Plan directory move with recursive import updates for all contained files

## Build Commands

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck
```

## Architecture

Expected project structure:

```
src/
  index.ts          # MCP server entry point
  tools/
    planRenameSymbol.ts
    planFileMove.ts
    planDirectoryMove.ts
  services/
    typescript-service.ts  # TypeScript Language Service wrapper
```

The TypeScript Language Service is used via:

- `findRenameLocations()` for symbol renames
- `getEditsForFileRename()` for file/directory moves
