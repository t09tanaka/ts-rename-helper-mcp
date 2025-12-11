/**
 * planRenameSymbol ツールの実装
 * シンボルのリネームに必要な編集プランを返す
 */

import ts from "typescript";
import path from "node:path";
import fs from "node:fs";
import { createTsService } from "../tsService.js";
import type {
  PlanRenameSymbolParams,
  PlanRenameSymbolResult,
  FileTextEdits,
  TextEdit,
  Range,
} from "../types.js";

/**
 * シンボルのリネームプランを作成する
 *
 * @param params リネームパラメータ
 * @returns リネーム可否と編集プラン
 */
export function planRenameSymbol(
  params: PlanRenameSymbolParams
): PlanRenameSymbolResult {
  // 1. projectRoot を絶対パスに正規化
  const absProjectRoot = path.resolve(params.projectRoot);

  // 2. createTsService で service を取得
  let service: ts.LanguageService;
  try {
    const tsServiceResult = createTsService(absProjectRoot);
    service = tsServiceResult.service;
  } catch (error) {
    return {
      canRename: false,
      reason:
        error instanceof Error ? error.message : "Failed to create TS service",
    };
  }

  // 3. filePath を絶対パスに正規化
  const absFilePath = path.isAbsolute(params.filePath)
    ? params.filePath
    : path.resolve(absProjectRoot, params.filePath);

  // 4. ファイル内容を読み込み
  if (!fs.existsSync(absFilePath)) {
    return {
      canRename: false,
      reason: `File not found: ${absFilePath}`,
    };
  }

  const fileText = fs.readFileSync(absFilePath, "utf8");
  const sourceFile = ts.createSourceFile(
    absFilePath,
    fileText,
    ts.ScriptTarget.Latest,
    true
  );

  // 5. ts.getPositionOfLineAndCharacter で位置を計算
  const pos = ts.getPositionOfLineAndCharacter(
    sourceFile,
    params.line,
    params.character
  );

  // 6. service.getRenameInfo() でリネーム可否を確認
  const renameInfo = service.getRenameInfo(absFilePath, pos);

  if (!renameInfo.canRename) {
    return {
      canRename: false,
      reason:
        renameInfo.localizedErrorMessage ?? "Cannot rename this symbol",
    };
  }

  // 7. service.findRenameLocations() でリネーム箇所を取得
  const locations =
    service.findRenameLocations(
      absFilePath,
      pos,
      params.findInStrings ?? false,
      params.findInComments ?? false,
      false // providePrefixAndSuffixTextForRename
    ) ?? [];

  // 8. 各 location を TextEdit に変換し、fileName ごとにまとめる
  const editsByFile = new Map<string, TextEdit[]>();

  for (const location of locations) {
    const fileName = location.fileName;

    // ファイルのテキストを読み込む
    if (!fs.existsSync(fileName)) {
      continue;
    }

    const locationFileText = fs.readFileSync(fileName, "utf8");
    const locationSourceFile = ts.createSourceFile(
      fileName,
      locationFileText,
      ts.ScriptTarget.Latest,
      true
    );

    // textSpan を Range に変換
    const start = ts.getLineAndCharacterOfPosition(
      locationSourceFile,
      location.textSpan.start
    );
    const end = ts.getLineAndCharacterOfPosition(
      locationSourceFile,
      location.textSpan.start + location.textSpan.length
    );

    const range: Range = {
      start: {
        line: start.line,
        character: start.character,
      },
      end: {
        line: end.line,
        character: end.character,
      },
    };

    // TextEdit を構築
    const textEdit: TextEdit = {
      range,
      newText: params.newName,
    };

    // fileName ごとにまとめる
    const edits = editsByFile.get(fileName) ?? [];
    edits.push(textEdit);
    editsByFile.set(fileName, edits);
  }

  // 9. FileTextEdits[] を構築
  const fileTextEdits: FileTextEdits[] = Array.from(editsByFile.entries()).map(
    ([filePath, textEdits]) => ({
      filePath,
      textEdits,
    })
  );

  return {
    canRename: true,
    edits: fileTextEdits,
  };
}
