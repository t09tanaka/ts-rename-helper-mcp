/**
 * planFileMove ツールの実装
 * ファイル移動/リネームに必要な編集プランを返す
 */

import ts from "typescript";
import path from "node:path";
import { createTsService } from "../tsService.js";
import type {
  PlanFileMoveParams,
  PlanFileMoveResult,
  FileTextEdits,
  TextEdit,
} from "../types.js";

/**
 * ファイル移動/リネームの編集プランを作成する
 *
 * @param params ファイル移動パラメータ
 * @returns 編集プランとファイル移動提案
 */
export function planFileMove(params: PlanFileMoveParams): PlanFileMoveResult {
  // 1. projectRoot を絶対パスに正規化
  const absProjectRoot = path.resolve(params.projectRoot);

  // 2. oldPath / newPath を projectRoot 基準で絶対パスに正規化
  const oldAbs = path.isAbsolute(params.oldPath)
    ? params.oldPath
    : path.resolve(absProjectRoot, params.oldPath);

  const newAbs = path.isAbsolute(params.newPath)
    ? params.newPath
    : path.resolve(absProjectRoot, params.newPath);

  // 3. createTsService から service を取得
  const { service } = createTsService(absProjectRoot);

  // 4. service.getEditsForFileRename を呼び出し
  const fileTextChanges = service.getEditsForFileRename(
    oldAbs,
    newAbs,
    /* formatOptions */ {},
    /* preferences */ {}
  );

  // 5. FileTextChanges[] を FileTextEdits[] に変換
  const edits: FileTextEdits[] = fileTextChanges.map((change) => {
    const fileName = change.fileName;
    const fileText = ts.sys.readFile(fileName);

    const textEdits: TextEdit[] = change.textChanges.map((textChange) => {
      // ファイルテキストがない場合はデフォルトの位置を使用
      if (!fileText) {
        return {
          range: {
            start: { line: 0, character: textChange.span.start },
            end: {
              line: 0,
              character: textChange.span.start + textChange.span.length,
            },
          },
          newText: textChange.newText,
        };
      }

      // span.start / span.length を Range に変換
      const sourceFile = ts.createSourceFile(
        fileName,
        fileText,
        ts.ScriptTarget.Latest,
        true
      );

      const start = ts.getLineAndCharacterOfPosition(
        sourceFile,
        textChange.span.start
      );
      const end = ts.getLineAndCharacterOfPosition(
        sourceFile,
        textChange.span.start + textChange.span.length
      );

      return {
        range: {
          start: {
            line: start.line,
            character: start.character,
          },
          end: {
            line: end.line,
            character: end.character,
          },
        },
        newText: textChange.newText,
      };
    });

    return {
      filePath: fileName,
      textEdits,
    };
  });

  // 6. fsMoves として 1 件追加
  const fsMoves = [
    {
      from: oldAbs,
      to: newAbs,
    },
  ];

  // 7. 結果を返す
  return {
    edits,
    fsMoves,
  };
}
