/**
 * 共通型定義
 * MCP ツールで使用される JSON 形状の型
 */

/**
 * 位置情報（0-based）
 */
export type Position = {
  line: number; // 0-based
  character: number; // 0-based
};

/**
 * 範囲（開始位置と終了位置）
 */
export type Range = {
  start: Position;
  end: Position;
};

/**
 * テキスト編集（範囲と新しいテキスト）
 */
export type TextEdit = {
  range: Range;
  newText: string;
};

/**
 * ファイルごとのテキスト編集リスト
 */
export type FileTextEdits = {
  filePath: string; // absolute path
  textEdits: TextEdit[];
};

/**
 * ファイル移動の提案
 */
export type FsMove = {
  from: string; // absolute path
  to: string; // absolute path
};

/**
 * planRenameSymbol の入力パラメータ
 */
export type PlanRenameSymbolParams = {
  projectRoot: string; // 絶対 or 相対
  filePath: string; // 絶対 or projectRoot からの相対
  line: number; // 0-based
  character: number; // 0-based
  newName: string;
  findInStrings?: boolean; // デフォルト false
  findInComments?: boolean; // デフォルト false
};

/**
 * planRenameSymbol の出力結果
 */
export type PlanRenameSymbolResult =
  | {
      canRename: false;
      reason: string;
    }
  | {
      canRename: true;
      edits: FileTextEdits[];
    };

/**
 * planFileMove の入力パラメータ
 */
export type PlanFileMoveParams = {
  projectRoot: string; // 絶対 or 相対
  oldPath: string; // 元ファイルパス
  newPath: string; // 移動先ファイルパス
};

/**
 * planFileMove の出力結果
 */
export type PlanFileMoveResult = {
  edits: FileTextEdits[];
  fsMoves: FsMove[]; // 通常は 1 件だけ
};

/**
 * planDirectoryMove の入力パラメータ
 */
export type PlanDirectoryMoveParams = {
  projectRoot: string; // 絶対 or 相対
  oldDir: string; // 元ディレクトリパス
  newDir: string; // 移動先ディレクトリパス
};

/**
 * planDirectoryMove の出力結果
 */
export type PlanDirectoryMoveResult = {
  edits: FileTextEdits[];
  fsMoves: FsMove[];
};
