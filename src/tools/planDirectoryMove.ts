import path from "node:path";
import ts from "typescript";
import { createTsService } from "../tsService.js";
import type {
  FileTextEdits,
  FsMove,
  TextEdit,
} from "../types.js";

/**
 * planDirectoryMove のパラメータ型
 */
export type PlanDirectoryMoveParams = {
  projectRoot: string;
  oldDir: string;
  newDir: string;
};

/**
 * planDirectoryMove の戻り値型
 */
export type PlanDirectoryMoveResult = {
  edits: FileTextEdits[];
  fsMoves: FsMove[];
};

/**
 * ディレクトリ移動/リネームの編集プランを計算する
 *
 * 処理フロー:
 * 1. projectRoot・oldDir・newDir を絶対パスに正規化
 * 2. createTsService(projectRoot) で service と parsedConfig を取得
 * 3. parsedConfig.fileNames から oldDir 配下のファイルだけを抽出
 * 4. 各 oldFile に対して newFile を計算（path.relative + path.join）
 * 5. 各ペアについて service.getEditsForFileRename() を呼び出し
 * 6. 全ての FileTextChanges をマージして FileTextEdits[] に変換
 *    - 同じ fileName に対する TextChange は1つの FileTextEdits にまとめる
 * 7. fsMoves にすべての oldFile / newFile ペアを列挙
 * 8. 結果を返す
 */
export function planDirectoryMove(
  params: PlanDirectoryMoveParams
): PlanDirectoryMoveResult {
  // 1. パスを絶対パスに正規化
  const projectRootAbs = path.resolve(params.projectRoot);
  const oldDirAbs = path.isAbsolute(params.oldDir)
    ? path.resolve(params.oldDir)
    : path.resolve(projectRootAbs, params.oldDir);
  const newDirAbs = path.isAbsolute(params.newDir)
    ? path.resolve(params.newDir)
    : path.resolve(projectRootAbs, params.newDir);

  // 2. TypeScript Language Service を取得
  const { service, parsedConfig } = createTsService(projectRootAbs);

  // 3. oldDir 配下のファイルだけを抽出
  const targetFiles = parsedConfig.fileNames.filter((file) => {
    const normalizedFile = path.normalize(file);
    const normalizedOldDir = path.normalize(oldDirAbs);
    return normalizedFile.startsWith(normalizedOldDir + path.sep);
  });

  // ファイルごとの編集をマージするためのマップ
  const editsMap = new Map<string, TextEdit[]>();
  const fsMoves: FsMove[] = [];

  // 4-6. 各ファイルについて移動先を計算し、編集を取得
  for (const oldFile of targetFiles) {
    // 4. newFile を計算
    const rel = path.relative(oldDirAbs, oldFile);
    const newFile = path.join(newDirAbs, rel);

    // 5. service.getEditsForFileRename() を呼び出し
    const fileTextChanges = service.getEditsForFileRename(
      oldFile,
      newFile,
      /* formatOptions */ {},
      /* preferences */ {}
    );

    // 6. FileTextChanges を TextEdit に変換してマージ
    for (const change of fileTextChanges) {
      const fileName = change.fileName;
      const existingEdits = editsMap.get(fileName) ?? [];

      for (const textChange of change.textChanges) {
        // textChange.span を Range に変換
        const fileText = ts.sys.readFile(fileName);
        if (!fileText) continue;

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

        const textEdit: TextEdit = {
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

        existingEdits.push(textEdit);
      }

      editsMap.set(fileName, existingEdits);
    }

    // 7. fsMoves にペアを追加
    fsMoves.push({
      from: oldFile,
      to: newFile,
    });
  }

  // editsMap を FileTextEdits[] に変換
  const edits: FileTextEdits[] = Array.from(editsMap.entries()).map(
    ([filePath, textEdits]) => ({
      filePath,
      textEdits,
    })
  );

  // 8. 結果を返す
  return {
    edits,
    fsMoves,
  };
}
