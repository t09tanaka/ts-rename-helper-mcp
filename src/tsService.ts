/**
 * TypeScript Language Service の生成・管理
 */

import ts from "typescript";
import path from "node:path";
import fs from "node:fs";

/**
 * TypeScript Language Service を生成する
 *
 * @param projectRoot プロジェクトルートディレクトリ（絶対 or 相対）
 * @returns Language Service とプロジェクトルート
 * @throws tsconfig.json が見つからない場合
 */
export function createTsService(projectRoot: string): {
  service: ts.LanguageService;
  projectRoot: string;
  parsedConfig: ts.ParsedCommandLine;
} {
  // projectRoot を絶対パスに正規化
  const absProjectRoot = path.resolve(projectRoot);

  // tsconfig.json を探索
  const configPath = ts.findConfigFile(
    absProjectRoot,
    ts.sys.fileExists,
    "tsconfig.json"
  );

  if (!configPath) {
    throw new Error(
      `tsconfig.json not found in or above: ${absProjectRoot}`
    );
  }

  // 設定ファイル読み込み & パース
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      `Failed to read tsconfig.json: ${ts.formatDiagnostic(
        configFile.error,
        {
          getCanonicalFileName: (f) => f,
          getCurrentDirectory: () => absProjectRoot,
          getNewLine: () => "\n",
        }
      )}`
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );

  if (parsed.errors.length > 0) {
    const errorMessages = parsed.errors
      .map((error) =>
        ts.formatDiagnostic(error, {
          getCanonicalFileName: (f) => f,
          getCurrentDirectory: () => absProjectRoot,
          getNewLine: () => "\n",
        })
      )
      .join("\n");
    throw new Error(`Failed to parse tsconfig.json: ${errorMessages}`);
  }

  const files = parsed.fileNames;

  // LanguageServiceHost 実装
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => files,
    getScriptVersion: () => "0", // 初期実装では常に 0
    getScriptSnapshot: (fileName) => {
      if (!fs.existsSync(fileName)) {
        return undefined;
      }
      const text = fs.readFileSync(fileName, "utf8");
      return ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => absProjectRoot,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };

  // Language Service 生成
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  return {
    service,
    projectRoot: absProjectRoot,
    parsedConfig: parsed,
  };
}
