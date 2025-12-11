/**
 * planFileMove のテスト
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { planFileMove } from "./planFileMove.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("planFileMove", () => {
  let testProjectDir: string;

  beforeAll(() => {
    // テスト用のプロジェクトディレクトリを作成
    testProjectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "plan-file-move-test-")
    );

    // tsconfig.json を作成
    const tsconfigContent = {
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        moduleResolution: "node",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        jsx: "react",
      },
      include: ["**/*.ts", "**/*.tsx"],
    };

    fs.writeFileSync(
      path.join(testProjectDir, "tsconfig.json"),
      JSON.stringify(tsconfigContent, null, 2)
    );

    // テスト用のファイル構造を作成
    // src/utils/helper.ts
    fs.mkdirSync(path.join(testProjectDir, "src", "utils"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(testProjectDir, "src", "utils", "helper.ts"),
      `export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function lowercase(str: string) {
  return str.toLowerCase();
}

export default function formatString(str: string) {
  return capitalize(str);
}
`
    );

    // src/main.ts (helper.ts を使用)
    fs.writeFileSync(
      path.join(testProjectDir, "src", "main.ts"),
      `import { capitalize, lowercase } from "./utils/helper.js";

export function formatName(name: string) {
  return capitalize(lowercase(name));
}
`
    );

    // src/app.ts (helper.ts を使用)
    fs.writeFileSync(
      path.join(testProjectDir, "src", "app.ts"),
      `import { capitalize } from "./utils/helper.js";

export function greet(name: string) {
  return \`Hello, \${capitalize(name)}!\`;
}
`
    );
  });

  afterAll(() => {
    // テストディレクトリを削除
    if (testProjectDir && fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  describe("基本機能", () => {
    it("ファイル移動の編集プランを正常に作成する", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts",
        newPath: "src/lib/helper.ts",
      });

      // fsMoves に1件の移動が含まれることを確認
      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].from).toBe(
        path.join(testProjectDir, "src", "utils", "helper.ts")
      );
      expect(result.fsMoves[0].to).toBe(
        path.join(testProjectDir, "src", "lib", "helper.ts")
      );

      // edits にインポートパスの更新が含まれることを確認
      expect(result.edits.length).toBeGreaterThan(0);

      // main.ts の編集を確認
      const mainEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("main.ts")
      );
      expect(mainEdit).toBeDefined();
      expect(mainEdit?.textEdits.length).toBeGreaterThan(0);

      // インポートパスが更新されることを確認
      const hasLibImport = mainEdit?.textEdits.some((edit) =>
        edit.newText.includes("lib/helper")
      );
      expect(hasLibImport).toBe(true);
    });

    it("絶対パスでファイル移動プランを作成できる", () => {
      const oldPathAbs = path.join(testProjectDir, "src", "utils", "helper.ts");
      const newPathAbs = path.join(testProjectDir, "src", "lib", "helper.ts");

      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: oldPathAbs,
        newPath: newPathAbs,
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].from).toBe(oldPathAbs);
      expect(result.fsMoves[0].to).toBe(newPathAbs);
    });

    it("複数のファイルからインポートされている場合、すべての編集が含まれる", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts",
        newPath: "src/lib/helper.ts",
      });

      // main.ts と app.ts の両方に編集が含まれることを確認
      const mainEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("main.ts")
      );
      const appEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("app.ts")
      );

      expect(mainEdit).toBeDefined();
      expect(appEdit).toBeDefined();
    });

    it("ファイル名を変更する場合の編集プランを作成できる", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts",
        newPath: "src/utils/string-utils.ts",
      });

      // fsMoves に1件の移動が含まれることを確認
      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].from).toBe(
        path.join(testProjectDir, "src", "utils", "helper.ts")
      );
      expect(result.fsMoves[0].to).toBe(
        path.join(testProjectDir, "src", "utils", "string-utils.ts")
      );

      // インポートパスが更新されることを確認
      const mainEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("main.ts")
      );
      expect(mainEdit).toBeDefined();

      const hasUpdatedImport = mainEdit?.textEdits.some((edit) =>
        edit.newText.includes("string-utils")
      );
      expect(hasUpdatedImport).toBe(true);
    });

    it("相対パスと絶対パスを混在させても正常に動作する", () => {
      const newPathAbs = path.join(testProjectDir, "src", "lib", "helper.ts");

      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts", // 相対パス
        newPath: newPathAbs, // 絶対パス
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].to).toBe(newPathAbs);
    });
  });

  describe("インポート形式のバリエーション", () => {
    let importTestDir: string;

    beforeAll(() => {
      importTestDir = path.join(testProjectDir, "import-test");
      fs.mkdirSync(importTestDir, { recursive: true });

      // テスト対象のファイル
      fs.writeFileSync(
        path.join(importTestDir, "target.ts"),
        `export const namedExport = "named";
export default "default export";
export const another = "another";
`
      );

      // named import
      fs.writeFileSync(
        path.join(importTestDir, "named-import.ts"),
        `import { namedExport, another } from "./target.js";
console.log(namedExport, another);
`
      );

      // default import
      fs.writeFileSync(
        path.join(importTestDir, "default-import.ts"),
        `import defaultValue from "./target.js";
console.log(defaultValue);
`
      );

      // namespace import
      fs.writeFileSync(
        path.join(importTestDir, "namespace-import.ts"),
        `import * as Target from "./target.js";
console.log(Target.namedExport);
`
      );

      // side-effect import
      fs.writeFileSync(
        path.join(importTestDir, "side-effect-import.ts"),
        `import "./target.js";
`
      );

      // dynamic import
      fs.writeFileSync(
        path.join(importTestDir, "dynamic-import.ts"),
        `async function loadTarget() {
  const module = await import("./target.js");
  return module.namedExport;
}
`
      );

      // re-export
      fs.writeFileSync(
        path.join(importTestDir, "re-export.ts"),
        `export { namedExport, another } from "./target.js";
`
      );

      // export * from
      fs.writeFileSync(
        path.join(importTestDir, "export-star.ts"),
        `export * from "./target.js";
`
      );

      // mixed imports
      fs.writeFileSync(
        path.join(importTestDir, "mixed-import.ts"),
        `import defaultValue, { namedExport } from "./target.js";
console.log(defaultValue, namedExport);
`
      );
    });

    it("named import の更新", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "import-test/target.ts",
        newPath: "import-test/renamed.ts",
      });

      const namedImportEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("named-import.ts")
      );
      expect(namedImportEdit).toBeDefined();
      expect(namedImportEdit?.textEdits.length).toBeGreaterThan(0);
      expect(
        namedImportEdit?.textEdits.some((edit) =>
          edit.newText.includes("renamed")
        )
      ).toBe(true);
    });

    it("default import の更新", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "import-test/target.ts",
        newPath: "import-test/renamed.ts",
      });

      const defaultImportEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("default-import.ts")
      );
      expect(defaultImportEdit).toBeDefined();
      expect(
        defaultImportEdit?.textEdits.some((edit) =>
          edit.newText.includes("renamed")
        )
      ).toBe(true);
    });

    it("namespace import (import * as) の更新", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "import-test/target.ts",
        newPath: "import-test/renamed.ts",
      });

      const namespaceImportEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("namespace-import.ts")
      );
      expect(namespaceImportEdit).toBeDefined();
      expect(
        namespaceImportEdit?.textEdits.some((edit) =>
          edit.newText.includes("renamed")
        )
      ).toBe(true);
    });

    it("side-effect import (import './file') の更新", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "import-test/target.ts",
        newPath: "import-test/renamed.ts",
      });

      const sideEffectImportEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("side-effect-import.ts")
      );
      expect(sideEffectImportEdit).toBeDefined();
      expect(
        sideEffectImportEdit?.textEdits.some((edit) =>
          edit.newText.includes("renamed")
        )
      ).toBe(true);
    });

    it("dynamic import (import()) の更新", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "import-test/target.ts",
        newPath: "import-test/renamed.ts",
      });

      const dynamicImportEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("dynamic-import.ts")
      );
      expect(dynamicImportEdit).toBeDefined();
      expect(
        dynamicImportEdit?.textEdits.some((edit) =>
          edit.newText.includes("renamed")
        )
      ).toBe(true);
    });

    it("re-export (export { x } from) の更新", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "import-test/target.ts",
        newPath: "import-test/renamed.ts",
      });

      const reExportEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("re-export.ts")
      );
      expect(reExportEdit).toBeDefined();
      expect(
        reExportEdit?.textEdits.some((edit) => edit.newText.includes("renamed"))
      ).toBe(true);
    });

    it("export * from の更新", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "import-test/target.ts",
        newPath: "import-test/renamed.ts",
      });

      const exportStarEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("export-star.ts")
      );
      expect(exportStarEdit).toBeDefined();
      expect(
        exportStarEdit?.textEdits.some((edit) =>
          edit.newText.includes("renamed")
        )
      ).toBe(true);
    });

    it("混在したインポートの更新", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "import-test/target.ts",
        newPath: "import-test/renamed.ts",
      });

      const mixedImportEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("mixed-import.ts")
      );
      expect(mixedImportEdit).toBeDefined();
      expect(
        mixedImportEdit?.textEdits.some((edit) =>
          edit.newText.includes("renamed")
        )
      ).toBe(true);
    });
  });

  describe("パス解決のバリエーション", () => {
    let pathTestDir: string;

    beforeAll(() => {
      pathTestDir = path.join(testProjectDir, "path-test");

      // 深いディレクトリ構造を作成
      fs.mkdirSync(path.join(pathTestDir, "deep", "nested", "dir"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(pathTestDir, "shallow"), { recursive: true });
      fs.mkdirSync(path.join(pathTestDir, "sibling"), { recursive: true });

      // 深い階層のファイル
      fs.writeFileSync(
        path.join(pathTestDir, "deep", "nested", "dir", "deep-file.ts"),
        `export const deepValue = "deep";
`
      );

      // 浅い階層のファイルが深いファイルをインポート
      fs.writeFileSync(
        path.join(pathTestDir, "shallow", "shallow-file.ts"),
        `import { deepValue } from "../deep/nested/dir/deep-file.js";
console.log(deepValue);
`
      );

      // プロジェクトルート近くのファイル
      fs.writeFileSync(
        path.join(pathTestDir, "root-file.ts"),
        `export const rootValue = "root";
`
      );

      // 深い階層からルートファイルをインポート
      fs.writeFileSync(
        path.join(pathTestDir, "deep", "nested", "dir", "imports-root.ts"),
        `import { rootValue } from "../../../root-file.js";
console.log(rootValue);
`
      );

      // 兄弟ディレクトリ用のファイル
      fs.writeFileSync(
        path.join(pathTestDir, "sibling", "sibling-file.ts"),
        `export const siblingValue = "sibling";
`
      );

      fs.writeFileSync(
        path.join(pathTestDir, "shallow", "imports-sibling.ts"),
        `import { siblingValue } from "../sibling/sibling-file.js";
console.log(siblingValue);
`
      );
    });

    it("親ディレクトリへの移動（深い → 浅い）", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "path-test/deep/nested/dir/deep-file.ts",
        newPath: "path-test/deep/deep-file.ts",
      });

      const shallowFileEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("shallow-file.ts")
      );
      expect(shallowFileEdit).toBeDefined();
      // パスが短くなることを確認（../deep/deep-file.js）
      expect(
        shallowFileEdit?.textEdits.some(
          (edit) =>
            edit.newText.includes("../deep/deep-file") &&
            !edit.newText.includes("nested")
        )
      ).toBe(true);
    });

    it("子ディレクトリへの移動（浅い → 深い）", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "path-test/root-file.ts",
        newPath: "path-test/deep/nested/dir/root-file.ts",
      });

      const importsRootEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("imports-root.ts")
      );
      expect(importsRootEdit).toBeDefined();
      // 同じディレクトリになるため ./root-file.js になる
      expect(
        importsRootEdit?.textEdits.some((edit) =>
          edit.newText.includes("./root-file")
        )
      ).toBe(true);
    });

    it("兄弟ディレクトリへの移動", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "path-test/sibling/sibling-file.ts",
        newPath: "path-test/shallow/sibling-file.ts",
      });

      const importsSiblingEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("imports-sibling.ts")
      );
      expect(importsSiblingEdit).toBeDefined();
      // 同じディレクトリになるため ./sibling-file.js になる
      expect(
        importsSiblingEdit?.textEdits.some((edit) =>
          edit.newText.includes("./sibling-file")
        )
      ).toBe(true);
    });

    it("プロジェクトルートへの移動", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "path-test/deep/nested/dir/deep-file.ts",
        newPath: "path-test/moved-to-root.ts",
      });

      const shallowFileEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("shallow-file.ts")
      );
      expect(shallowFileEdit).toBeDefined();
      expect(
        shallowFileEdit?.textEdits.some((edit) =>
          edit.newText.includes("../moved-to-root")
        )
      ).toBe(true);
    });

    it("同じディレクトリ内でファイル名だけを変更する場合", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts",
        newPath: "src/utils/utility.ts",
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].from).toBe(
        path.join(testProjectDir, "src", "utils", "helper.ts")
      );
      expect(result.fsMoves[0].to).toBe(
        path.join(testProjectDir, "src", "utils", "utility.ts")
      );

      // インポートパスが "./utils/utility.js" に更新されることを確認
      const mainEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("main.ts")
      );
      expect(mainEdit).toBeDefined();

      const hasUtilityImport = mainEdit?.textEdits.some((edit) =>
        edit.newText.includes("utility")
      );
      expect(hasUtilityImport).toBe(true);
    });

    it("深い階層へのファイル移動もサポートする", () => {
      // src/deep/nested/dir を作成
      fs.mkdirSync(path.join(testProjectDir, "src", "deep", "nested", "dir"), {
        recursive: true,
      });

      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts",
        newPath: "src/deep/nested/dir/helper.ts",
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].to).toBe(
        path.join(testProjectDir, "src", "deep", "nested", "dir", "helper.ts")
      );

      // インポートパスが正しく更新されることを確認
      const mainEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("main.ts")
      );
      expect(mainEdit).toBeDefined();

      const hasDeepImport = mainEdit?.textEdits.some((edit) =>
        edit.newText.includes("deep/nested/dir/helper")
      );
      expect(hasDeepImport).toBe(true);
    });
  });

  describe("ファイル拡張子", () => {
    let extensionTestDir: string;

    beforeAll(() => {
      extensionTestDir = path.join(testProjectDir, "extension-test");
      fs.mkdirSync(extensionTestDir, { recursive: true });

      // .tsx ファイル
      fs.writeFileSync(
        path.join(extensionTestDir, "component.tsx"),
        `export function Component() {
  return <div>Hello</div>;
}
`
      );

      fs.writeFileSync(
        path.join(extensionTestDir, "app.tsx"),
        `import { Component } from "./component.js";

export function App() {
  return <Component />;
}
`
      );

      // インポートパスに拡張子がある場合
      fs.writeFileSync(
        path.join(extensionTestDir, "with-extension.ts"),
        `export const value = "with-ext";
`
      );

      fs.writeFileSync(
        path.join(extensionTestDir, "imports-with-ext.ts"),
        `import { value } from "./with-extension.js";
console.log(value);
`
      );

      // インポートパスに拡張子がない場合（TypeScript の場合は稀だが念のため）
      fs.writeFileSync(
        path.join(extensionTestDir, "no-extension.ts"),
        `export const noExtValue = "no-ext";
`
      );
    });

    it(".ts → .ts の移動", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "extension-test/with-extension.ts",
        newPath: "extension-test/renamed-extension.ts",
      });

      expect(result.fsMoves[0].from).toContain("with-extension.ts");
      expect(result.fsMoves[0].to).toContain("renamed-extension.ts");

      const importsEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("imports-with-ext.ts")
      );
      expect(importsEdit).toBeDefined();
      expect(
        importsEdit?.textEdits.some((edit) =>
          edit.newText.includes("renamed-extension")
        )
      ).toBe(true);
    });

    it(".tsx ファイルの移動", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "extension-test/component.tsx",
        newPath: "extension-test/renamed-component.tsx",
      });

      expect(result.fsMoves[0].from).toContain("component.tsx");
      expect(result.fsMoves[0].to).toContain("renamed-component.tsx");

      const appEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("app.tsx")
      );
      expect(appEdit).toBeDefined();
      expect(
        appEdit?.textEdits.some((edit) =>
          edit.newText.includes("renamed-component")
        )
      ).toBe(true);
    });

    it("インポートパスに拡張子がある場合", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "extension-test/with-extension.ts",
        newPath: "extension-test/moved.ts",
      });

      const importsEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("imports-with-ext.ts")
      );
      expect(importsEdit).toBeDefined();
      // .js 拡張子が保持されることを確認
      expect(
        importsEdit?.textEdits.some((edit) => edit.newText.includes("moved.js"))
      ).toBe(true);
    });
  });

  describe("エッジケース", () => {
    let edgeCaseDir: string;

    beforeAll(() => {
      edgeCaseDir = path.join(testProjectDir, "edge-case");
      fs.mkdirSync(edgeCaseDir, { recursive: true });

      // インポートされていないファイル
      fs.writeFileSync(
        path.join(edgeCaseDir, "unused.ts"),
        `export const unused = "unused";
`
      );

      // 自己参照のテスト用ファイル
      fs.writeFileSync(
        path.join(edgeCaseDir, "self-reference.ts"),
        `export const value = "value";

// 同じファイル内で使用（自己参照ではない）
console.log(value);
`
      );

      // 循環参照のテスト
      fs.writeFileSync(
        path.join(edgeCaseDir, "circular-a.ts"),
        `import { bValue } from "./circular-b.js";
export const aValue = "a";
console.log(bValue);
`
      );

      fs.writeFileSync(
        path.join(edgeCaseDir, "circular-b.ts"),
        `import { aValue } from "./circular-a.js";
export const bValue = "b";
console.log(aValue);
`
      );

      // index.ts の移動テスト
      fs.mkdirSync(path.join(edgeCaseDir, "module"), { recursive: true });
      fs.writeFileSync(
        path.join(edgeCaseDir, "module", "index.ts"),
        `export const moduleValue = "module";
`
      );

      fs.writeFileSync(
        path.join(edgeCaseDir, "imports-index.ts"),
        `import { moduleValue } from "./module/index.js";
console.log(moduleValue);
`
      );
    });

    it("インポートされていないファイルの移動", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "edge-case/unused.ts",
        newPath: "edge-case/moved-unused.ts",
      });

      // fsMoves は存在する
      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].from).toContain("unused.ts");
      expect(result.fsMoves[0].to).toContain("moved-unused.ts");

      // edits は空の可能性がある（他のファイルからインポートされていないため）
      // TypeScript Language Service は影響を受けるファイルのみを返す
      const hasEdits = result.edits.length > 0;
      // インポートされていないので編集は不要
      expect(hasEdits).toBe(false);
    });

    it("循環参照があるファイルの移動", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "edge-case/circular-a.ts",
        newPath: "edge-case/renamed-circular-a.ts",
      });

      expect(result.fsMoves).toHaveLength(1);

      // circular-b.ts のインポートパスが更新される
      const circularBEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("circular-b.ts")
      );
      expect(circularBEdit).toBeDefined();
      expect(
        circularBEdit?.textEdits.some((edit) =>
          edit.newText.includes("renamed-circular-a")
        )
      ).toBe(true);
    });

    it("index.ts の移動（ディレクトリインポートに影響）", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "edge-case/module/index.ts",
        newPath: "edge-case/module/main.ts",
      });

      expect(result.fsMoves).toHaveLength(1);

      // imports-index.ts のインポートパスが更新される
      const importsIndexEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("imports-index.ts")
      );
      expect(importsIndexEdit).toBeDefined();
      // index.js から main.js に変更される
      expect(
        importsIndexEdit?.textEdits.some((edit) =>
          edit.newText.includes("main.js")
        )
      ).toBe(true);
    });

    it("同じパスに移動しようとした場合", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts",
        newPath: "src/utils/helper.ts",
      });

      // fsMoves は存在するが、from と to が同じ
      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].from).toBe(result.fsMoves[0].to);

      // edits は空の可能性が高い（変更がないため）
      const hasEdits = result.edits.length > 0;
      // 同じパスなので編集は不要
      expect(hasEdits).toBe(false);
    });
  });

  describe("複雑なプロジェクト構造", () => {
    let complexDir: string;

    beforeAll(() => {
      complexDir = path.join(testProjectDir, "complex");

      // barrel ファイル構造
      fs.mkdirSync(path.join(complexDir, "lib", "utils"), { recursive: true });

      fs.writeFileSync(
        path.join(complexDir, "lib", "utils", "string.ts"),
        `export function upper(s: string) { return s.toUpperCase(); }
`
      );

      fs.writeFileSync(
        path.join(complexDir, "lib", "utils", "number.ts"),
        `export function double(n: number) { return n * 2; }
`
      );

      // barrel ファイル（index.ts で re-export）
      fs.writeFileSync(
        path.join(complexDir, "lib", "utils", "index.ts"),
        `export * from "./string.js";
export * from "./number.js";
`
      );

      // barrel 経由でインポート
      fs.writeFileSync(
        path.join(complexDir, "app.ts"),
        `import { upper, double } from "./lib/utils/index.js";
console.log(upper("test"), double(5));
`
      );

      // 直接インポート
      fs.writeFileSync(
        path.join(complexDir, "direct.ts"),
        `import { upper } from "./lib/utils/string.js";
console.log(upper("direct"));
`
      );
    });

    it("barrel ファイル（index.ts で re-export）を持つ構造", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "complex/lib/utils/string.ts",
        newPath: "complex/lib/utils/text.ts",
      });

      expect(result.fsMoves).toHaveLength(1);

      // index.ts の re-export が更新される
      const indexEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("utils/index.ts")
      );
      expect(indexEdit).toBeDefined();
      expect(
        indexEdit?.textEdits.some((edit) => edit.newText.includes("./text.js"))
      ).toBe(true);

      // 直接インポートしているファイルも更新される
      const directEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("direct.ts")
      );
      expect(directEdit).toBeDefined();
      expect(
        directEdit?.textEdits.some((edit) => edit.newText.includes("text.js"))
      ).toBe(true);
    });

    it("barrel ファイル内の複数ファイルに影響する移動", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "complex/lib/utils/number.ts",
        newPath: "complex/lib/math/number.ts",
      });

      expect(result.fsMoves).toHaveLength(1);

      // index.ts の re-export が更新される
      const indexEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("utils/index.ts")
      );
      expect(indexEdit).toBeDefined();
      expect(
        indexEdit?.textEdits.some((edit) =>
          edit.newText.includes("../math/number")
        )
      ).toBe(true);
    });
  });

  describe("edits の検証", () => {
    it("Range の値が正しく計算される", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts",
        newPath: "src/lib/helper.ts",
      });

      const mainEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("main.ts")
      );
      expect(mainEdit).toBeDefined();

      // 各 TextEdit の range が正しい形式であることを確認
      mainEdit?.textEdits.forEach((edit) => {
        expect(edit.range.start.line).toBeGreaterThanOrEqual(0);
        expect(edit.range.start.character).toBeGreaterThanOrEqual(0);
        expect(edit.range.end.line).toBeGreaterThanOrEqual(
          edit.range.start.line
        );

        if (edit.range.end.line === edit.range.start.line) {
          expect(edit.range.end.character).toBeGreaterThanOrEqual(
            edit.range.start.character
          );
        }
      });
    });

    it("newText の内容が正確か", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts",
        newPath: "src/lib/helper.ts",
      });

      const mainEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("main.ts")
      );
      expect(mainEdit).toBeDefined();

      // newText にインポートパスが含まれることを確認
      const hasImportPath = mainEdit?.textEdits.some((edit) => {
        const text = edit.newText;
        return text.includes("lib/helper") || text.includes("./lib/helper");
      });
      expect(hasImportPath).toBe(true);

      // newText が空でないことを確認
      mainEdit?.textEdits.forEach((edit) => {
        expect(edit.newText.length).toBeGreaterThan(0);
      });
    });

    it("同一ファイルに複数の編集がある場合", () => {
      // 複数のインポート文を持つファイルを作成
      const multiImportDir = path.join(testProjectDir, "multi-import");
      fs.mkdirSync(multiImportDir, { recursive: true });

      fs.writeFileSync(
        path.join(multiImportDir, "target.ts"),
        `export const value1 = "value1";
export const value2 = "value2";
`
      );

      fs.writeFileSync(
        path.join(multiImportDir, "consumer.ts"),
        `import { value1 } from "./target.js";
import { value2 } from "./target.js";

console.log(value1, value2);
`
      );

      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "multi-import/target.ts",
        newPath: "multi-import/renamed.ts",
      });

      const consumerEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("consumer.ts")
      );
      expect(consumerEdit).toBeDefined();

      // 複数の編集が含まれることを確認
      expect(consumerEdit?.textEdits.length).toBeGreaterThanOrEqual(1);

      // すべての編集が "renamed" を含むことを確認
      consumerEdit?.textEdits.forEach((edit) => {
        expect(edit.newText).toContain("renamed");
      });

      // 編集が重複していないことを確認（Range が異なる）
      const ranges = consumerEdit?.textEdits.map((edit) => edit.range) ?? [];
      const uniqueRanges = new Set(
        ranges.map((r) =>
          `${r.start.line},${r.start.character}-${r.end.line},${r.end.character}`
        )
      );
      expect(uniqueRanges.size).toBe(ranges.length);
    });

    it("編集が行番号順にソートされている", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts",
        newPath: "src/lib/helper.ts",
      });

      result.edits.forEach((fileEdit) => {
        const textEdits = fileEdit.textEdits;
        for (let i = 1; i < textEdits.length; i++) {
          const prev = textEdits[i - 1].range.start;
          const curr = textEdits[i].range.start;

          // 前の編集の開始位置が現在の編集の開始位置より前であることを確認
          const isOrdered =
            prev.line < curr.line ||
            (prev.line === curr.line && prev.character <= curr.character);
          expect(isOrdered).toBe(true);
        }
      });
    });

    it("編集の Range が元のインポート文の位置と一致する", () => {
      const result = planFileMove({
        projectRoot: testProjectDir,
        oldPath: "src/utils/helper.ts",
        newPath: "src/lib/helper.ts",
      });

      const mainEdit = result.edits.find((edit) =>
        edit.filePath.endsWith("main.ts")
      );
      expect(mainEdit).toBeDefined();

      // main.ts の内容を読み取る
      const mainContent = fs.readFileSync(
        path.join(testProjectDir, "src", "main.ts"),
        "utf8"
      );
      const lines = mainContent.split("\n");

      mainEdit?.textEdits.forEach((edit) => {
        const { start, end } = edit.range;

        // 範囲が有効であることを確認
        expect(start.line).toBeLessThan(lines.length);
        expect(end.line).toBeLessThan(lines.length);

        // 範囲内のテキストを取得
        let originalText = "";
        if (start.line === end.line) {
          originalText = lines[start.line].substring(
            start.character,
            end.character
          );
        } else {
          // 複数行にまたがる場合
          originalText = lines[start.line].substring(start.character);
          for (let i = start.line + 1; i < end.line; i++) {
            originalText += "\n" + lines[i];
          }
          originalText += "\n" + lines[end.line].substring(0, end.character);
        }

        // 元のテキストに "utils/helper" が含まれることを確認
        expect(originalText).toContain("utils/helper");
      });
    });
  });
});
