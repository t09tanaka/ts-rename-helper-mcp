#!/usr/bin/env node

/**
 * MCP Server エントリポイント
 * TypeScript シンボルリネームとファイル/ディレクトリ移動プラン機能を提供
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { planRenameSymbol } from "./tools/planRenameSymbol.js";
import { planFileMove } from "./tools/planFileMove.js";
import {
  planDirectoryMove,
  type PlanDirectoryMoveParams,
} from "./tools/planDirectoryMove.js";
import type { PlanRenameSymbolParams, PlanFileMoveParams } from "./types.js";

/**
 * MCP ツール定義
 */
const TOOLS: Tool[] = [
  {
    name: "planRenameSymbol",
    description:
      "Compute edits to rename a TypeScript symbol at a specific position. Returns edit plans without modifying the filesystem.",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: {
          type: "string",
          description: "Absolute or relative path to the project root",
        },
        filePath: {
          type: "string",
          description:
            "Absolute path or path relative to projectRoot of the file containing the symbol",
        },
        line: {
          type: "number",
          description: "0-based line number of the symbol",
        },
        character: {
          type: "number",
          description: "0-based character position of the symbol",
        },
        newName: {
          type: "string",
          description: "The new name for the symbol",
        },
        findInStrings: {
          type: "boolean",
          description: "Whether to find occurrences in strings (default: false)",
        },
        findInComments: {
          type: "boolean",
          description:
            "Whether to find occurrences in comments (default: false)",
        },
      },
      required: ["projectRoot", "filePath", "line", "character", "newName"],
    },
  },
  {
    name: "planFileMove",
    description:
      "Plan file move/rename with import path updates. Returns edit plans and file move suggestions without modifying the filesystem.",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: {
          type: "string",
          description: "Absolute or relative path to the project root",
        },
        oldPath: {
          type: "string",
          description:
            "Absolute path or path relative to projectRoot of the file to move",
        },
        newPath: {
          type: "string",
          description:
            "Absolute path or path relative to projectRoot of the destination",
        },
      },
      required: ["projectRoot", "oldPath", "newPath"],
    },
  },
  {
    name: "planDirectoryMove",
    description:
      "Plan directory move with recursive import updates for all contained files. Returns edit plans and file move suggestions without modifying the filesystem.",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: {
          type: "string",
          description: "Absolute or relative path to the project root",
        },
        oldDir: {
          type: "string",
          description:
            "Absolute path or path relative to projectRoot of the directory to move",
        },
        newDir: {
          type: "string",
          description:
            "Absolute path or path relative to projectRoot of the destination",
        },
      },
      required: ["projectRoot", "oldDir", "newDir"],
    },
  },
];

/**
 * MCP サーバーの起動
 */
async function main() {
  // Server インスタンスを作成
  const server = new Server(
    {
      name: "ts-rename-helper-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // ツールリストのリクエストをハンドル
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS,
    };
  });

  // ツール呼び出しのリクエストをハンドル
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "planRenameSymbol": {
          const params = args as unknown as PlanRenameSymbolParams;
          const result = planRenameSymbol(params);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "planFileMove": {
          const params = args as unknown as PlanFileMoveParams;
          const result = planFileMove(params);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "planDirectoryMove": {
          const params = args as unknown as PlanDirectoryMoveParams;
          const result = planDirectoryMove(params);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error executing tool ${name}:`, errorMessage);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: errorMessage,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });

  // StdioServerTransport でサーバーを起動
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("ts-rename-helper-mcp server started");
}

// メイン関数を実行
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
