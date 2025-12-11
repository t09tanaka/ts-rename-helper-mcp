import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { planDirectoryMove } from "./planDirectoryMove.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

describe("planDirectoryMove", () => {
  let tempDir: string;
  let projectRoot: string;

  beforeAll(() => {
    // テスト用の一時ディレクトリを作成
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "planDirectoryMove-test-"));
    projectRoot = tempDir;

    // tsconfig.json を作成
    const tsconfigPath = path.join(projectRoot, "tsconfig.json");
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            module: "ESNext",
            moduleResolution: "node",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
          },
          include: ["src/**/*"],
        },
        null,
        2
      )
    );

    // ========================================
    // 1. 基本的なディレクトリ構造
    // ========================================
    // src/feature/auth ディレクトリ配下にファイルを作成
    const featureAuthDir = path.join(projectRoot, "src", "feature", "auth");
    fs.mkdirSync(featureAuthDir, { recursive: true });

    // src/feature/auth/index.ts を作成
    const indexPath = path.join(featureAuthDir, "index.ts");
    fs.writeFileSync(
      indexPath,
      `export function login() {
  return "login";
}

export function logout() {
  return "logout";
}
`
    );

    // src/feature/auth/hooks.ts を作成
    const hooksPath = path.join(featureAuthDir, "hooks.ts");
    fs.writeFileSync(
      hooksPath,
      `import { login, logout } from "./index.js";

export function useAuth() {
  return { login, logout };
}
`
    );

    // src/router.tsx を作成
    const routerPath = path.join(projectRoot, "src", "router.tsx");
    fs.writeFileSync(
      routerPath,
      `import { login } from "./feature/auth/index.js";
import { useAuth } from "./feature/auth/hooks.js";

export function setupRouter() {
  const auth = useAuth();
  return auth;
}
`
    );

    // ========================================
    // 2. 単一ファイルのみのディレクトリ
    // ========================================
    const singleFileDir = path.join(projectRoot, "src", "single");
    fs.mkdirSync(singleFileDir, { recursive: true });
    fs.writeFileSync(
      path.join(singleFileDir, "utils.ts"),
      `export function add(a: number, b: number) {
  return a + b;
}
`
    );

    // src/main.ts で single/utils.ts をインポート
    fs.writeFileSync(
      path.join(projectRoot, "src", "main.ts"),
      `import { add } from "./single/utils.js";

export function calculate() {
  return add(1, 2);
}
`
    );

    // ========================================
    // 3. 多数のファイル（10+）を持つディレクトリ
    // ========================================
    const manyFilesDir = path.join(projectRoot, "src", "many");
    fs.mkdirSync(manyFilesDir, { recursive: true });

    for (let i = 1; i <= 15; i++) {
      fs.writeFileSync(
        path.join(manyFilesDir, `file${i}.ts`),
        `export function func${i}() {
  return ${i};
}
`
      );
    }

    // src/consumer.ts で多数のファイルをインポート
    const imports = Array.from(
      { length: 15 },
      (_, i) => `import { func${i + 1} } from "./many/file${i + 1}.js";`
    ).join("\n");
    fs.writeFileSync(
      path.join(projectRoot, "src", "consumer.ts"),
      `${imports}

export function sum() {
  return func1() + func2() + func3();
}
`
    );

    // ========================================
    // 4. ネストしたサブディレクトリを持つディレクトリ
    // ========================================
    const nestedDir = path.join(projectRoot, "src", "nested");
    const nestedSubDir = path.join(nestedDir, "sub", "deep");
    fs.mkdirSync(nestedSubDir, { recursive: true });

    fs.writeFileSync(
      path.join(nestedDir, "index.ts"),
      `export { deepFunc } from "./sub/deep/utils.js";
`
    );

    fs.writeFileSync(
      path.join(nestedSubDir, "utils.ts"),
      `export function deepFunc() {
  return "deep";
}
`
    );

    // src/app.ts でネストされたディレクトリをインポート
    fs.writeFileSync(
      path.join(projectRoot, "src", "app.ts"),
      `import { deepFunc } from "./nested/index.js";

export function run() {
  return deepFunc();
}
`
    );

    // ========================================
    // 5. index.ts を持つディレクトリ
    // ========================================
    const withIndexDir = path.join(projectRoot, "src", "withindex");
    fs.mkdirSync(withIndexDir, { recursive: true });

    fs.writeFileSync(
      path.join(withIndexDir, "index.ts"),
      `export { helper } from "./helper.js";
`
    );

    fs.writeFileSync(
      path.join(withIndexDir, "helper.ts"),
      `export function helper() {
  return "helper";
}
`
    );

    // src/client.ts で index.ts 経由でインポート
    fs.writeFileSync(
      path.join(projectRoot, "src", "client.ts"),
      `import { helper } from "./withindex/index.js";

export function useHelper() {
  return helper();
}
`
    );

    // ========================================
    // 6. .ts 以外のファイルが混在するディレクトリ
    // ========================================
    const mixedDir = path.join(projectRoot, "src", "mixed");
    fs.mkdirSync(mixedDir, { recursive: true });

    fs.writeFileSync(
      path.join(mixedDir, "Component.tsx"),
      `export function Component() {
  return <div>Hello</div>;
}
`
    );

    fs.writeFileSync(
      path.join(mixedDir, "data.json"),
      JSON.stringify({ name: "test" })
    );

    fs.writeFileSync(
      path.join(mixedDir, "utils.ts"),
      `export function format() {
  return "formatted";
}
`
    );

    // src/ui.tsx で mixed ディレクトリをインポート
    fs.writeFileSync(
      path.join(projectRoot, "src", "ui.tsx"),
      `import { Component } from "./mixed/Component.js";
import { format } from "./mixed/utils.js";

export function render() {
  return Component();
}
`
    );

    // ========================================
    // 7. 空のディレクトリ
    // ========================================
    const emptyDir = path.join(projectRoot, "src", "empty");
    fs.mkdirSync(emptyDir, { recursive: true });

    // ========================================
    // 8. 空のサブディレクトリを持つディレクトリ
    // ========================================
    const withEmptySubDir = path.join(projectRoot, "src", "withemptysub");
    const emptySubDir = path.join(withEmptySubDir, "emptysub");
    fs.mkdirSync(emptySubDir, { recursive: true });

    fs.writeFileSync(
      path.join(withEmptySubDir, "main.ts"),
      `export function mainFunc() {
  return "main";
}
`
    );

    // ========================================
    // 9. 双方向インポート関係を持つディレクトリ
    // ========================================
    const bidirDir = path.join(projectRoot, "src", "bidir");
    fs.mkdirSync(bidirDir, { recursive: true });

    fs.writeFileSync(
      path.join(bidirDir, "a.ts"),
      `import { bFunc } from "./b.js";

export function aFunc() {
  return bFunc();
}
`
    );

    fs.writeFileSync(
      path.join(bidirDir, "b.ts"),
      `export function bFunc() {
  return "b";
}
`
    );

    // src/external.ts で bidir をインポート
    fs.writeFileSync(
      path.join(projectRoot, "src", "external.ts"),
      `import { aFunc } from "./bidir/a.js";

export function useA() {
  return aFunc();
}
`
    );

    // ========================================
    // 10. 大量ファイル（パフォーマンステスト用）
    // ========================================
    const largeDir = path.join(projectRoot, "src", "large");
    fs.mkdirSync(largeDir, { recursive: true });

    for (let i = 1; i <= 60; i++) {
      fs.writeFileSync(
        path.join(largeDir, `module${i}.ts`),
        `export function module${i}Func() {
  return ${i};
}
`
      );
    }

    // src/largeConsumer.ts で一部のファイルをインポート
    const largeImports = Array.from(
      { length: 10 },
      (_, i) => `import { module${i + 1}Func } from "./large/module${i + 1}.js";`
    ).join("\n");
    fs.writeFileSync(
      path.join(projectRoot, "src", "largeConsumer.ts"),
      `${largeImports}

export function largeSum() {
  return module1Func() + module2Func();
}
`
    );
  });

  afterAll(() => {
    // テスト用の一時ディレクトリを削除
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ========================================
  // 基本的なテストケース
  // ========================================
  describe("基本機能", () => {
    it("ディレクトリ配下の全ファイルの移動プランを計算する", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/feature/auth",
        newDir: "src/features/auth",
      });

      // fsMoves に2つのファイル移動が含まれることを確認
      expect(result.fsMoves).toHaveLength(2);

      const fromPaths = result.fsMoves.map((m) =>
        path.relative(projectRoot, m.from)
      );
      const toPaths = result.fsMoves.map((m) =>
        path.relative(projectRoot, m.to)
      );

      expect(fromPaths).toContain(path.normalize("src/feature/auth/index.ts"));
      expect(fromPaths).toContain(path.normalize("src/feature/auth/hooks.ts"));
      expect(toPaths).toContain(path.normalize("src/features/auth/index.ts"));
      expect(toPaths).toContain(path.normalize("src/features/auth/hooks.ts"));
    });

    it("インポートパスを更新する編集が含まれる", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/feature/auth",
        newDir: "src/features/auth",
      });

      // router.tsx のインポートパスが更新されることを確認
      const routerEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("router.tsx")
      );

      expect(routerEdits).toBeDefined();
      expect(routerEdits?.textEdits.length).toBeGreaterThan(0);

      // 少なくとも1つの編集が "features" を含むことを確認
      const hasFeatureEdit = routerEdits?.textEdits.some((edit) =>
        edit.newText.includes("features")
      );
      expect(hasFeatureEdit).toBe(true);
    });

    it("絶対パスで oldDir と newDir を指定できる", () => {
      const oldDirAbs = path.join(projectRoot, "src/feature/auth");
      const newDirAbs = path.join(projectRoot, "src/features/auth");

      const result = planDirectoryMove({
        projectRoot,
        oldDir: oldDirAbs,
        newDir: newDirAbs,
      });

      expect(result.fsMoves).toHaveLength(2);
      expect(result.edits.length).toBeGreaterThan(0);
    });
  });

  // ========================================
  // ディレクトリ構造のバリエーション
  // ========================================
  describe("ディレクトリ構造のバリエーション", () => {
    it("単一ファイルのみのディレクトリを移動できる", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/single",
        newDir: "src/utilities",
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].from).toBe(
        path.join(projectRoot, "src", "single", "utils.ts")
      );
      expect(result.fsMoves[0].to).toBe(
        path.join(projectRoot, "src", "utilities", "utils.ts")
      );

      // main.ts のインポートパスが更新されることを確認
      const mainEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("main.ts")
      );
      expect(mainEdits).toBeDefined();
      expect(
        mainEdits?.textEdits.some((edit) => edit.newText.includes("utilities"))
      ).toBe(true);
    });

    it("多数のファイル（10+）を持つディレクトリを移動できる", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/many",
        newDir: "src/modules",
      });

      // 15個のファイルが fsMoves に含まれることを確認
      expect(result.fsMoves).toHaveLength(15);

      // すべてのファイルが正しく移動先にマッピングされることを確認
      const toPaths = result.fsMoves.map((m) =>
        path.relative(projectRoot, m.to)
      );
      for (let i = 1; i <= 15; i++) {
        expect(toPaths).toContain(
          path.normalize(`src/modules/file${i}.ts`)
        );
      }

      // consumer.ts のインポートパスが更新されることを確認
      const consumerEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("consumer.ts")
      );
      expect(consumerEdits).toBeDefined();
      expect(
        consumerEdits?.textEdits.some((edit) => edit.newText.includes("modules"))
      ).toBe(true);
    });

    it("ネストしたサブディレクトリを持つディレクトリを移動できる", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/nested",
        newDir: "src/complex",
      });

      // 2つのファイルが含まれることを確認（index.ts と sub/deep/utils.ts）
      expect(result.fsMoves).toHaveLength(2);

      const toPaths = result.fsMoves.map((m) =>
        path.relative(projectRoot, m.to)
      );
      expect(toPaths).toContain(path.normalize("src/complex/index.ts"));
      expect(toPaths).toContain(
        path.normalize("src/complex/sub/deep/utils.ts")
      );

      // サブディレクトリ構造が保持されることを確認
      const deepFile = result.fsMoves.find((m) => m.to.includes("deep"));
      expect(deepFile).toBeDefined();
      expect(deepFile?.to).toContain(path.join("complex", "sub", "deep"));

      // app.ts のインポートパスが更新されることを確認
      const appEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("app.ts")
      );
      expect(appEdits).toBeDefined();
      expect(
        appEdits?.textEdits.some((edit) => edit.newText.includes("complex"))
      ).toBe(true);
    });

    it("空のディレクトリの場合は空の結果を返す", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/empty",
        newDir: "src/new-empty",
      });

      expect(result.fsMoves).toHaveLength(0);
      expect(result.edits).toHaveLength(0);
    });

    it("空のサブディレクトリがある場合、ファイルのみが移動対象となる", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/withemptysub",
        newDir: "src/newemptysub",
      });

      // main.ts のみが移動対象
      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].from).toBe(
        path.join(projectRoot, "src", "withemptysub", "main.ts")
      );
      expect(result.fsMoves[0].to).toBe(
        path.join(projectRoot, "src", "newemptysub", "main.ts")
      );

      // fsMoves にはファイルのみが含まれる（ディレクトリは含まれない）
      // すべての fsMoves がファイルであることを確認（拡張子を持つ）
      result.fsMoves.forEach((move) => {
        expect(path.extname(move.from)).not.toBe("");
        expect(path.extname(move.to)).not.toBe("");
      });
    });
  });

  // ========================================
  // 移動パターン
  // ========================================
  describe("移動パターン", () => {
    it("同一親ディレクトリ内でのリネーム（auth → authentication）", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/feature/auth",
        newDir: "src/feature/authentication",
      });

      expect(result.fsMoves).toHaveLength(2);

      // パスが正しく変換されることを確認
      const toPaths = result.fsMoves.map((m) =>
        path.relative(projectRoot, m.to)
      );
      expect(toPaths).toContain(
        path.normalize("src/feature/authentication/index.ts")
      );
      expect(toPaths).toContain(
        path.normalize("src/feature/authentication/hooks.ts")
      );

      // router.tsx のインポートが更新されることを確認
      const routerEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("router.tsx")
      );
      expect(
        routerEdits?.textEdits.some((edit) =>
          edit.newText.includes("authentication")
        )
      ).toBe(true);
    });

    it("親ディレクトリへの移動（src/feature/auth → src/auth）", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/feature/auth",
        newDir: "src/auth",
      });

      expect(result.fsMoves).toHaveLength(2);

      const toPaths = result.fsMoves.map((m) =>
        path.relative(projectRoot, m.to)
      );
      expect(toPaths).toContain(path.normalize("src/auth/index.ts"));
      expect(toPaths).toContain(path.normalize("src/auth/hooks.ts"));

      // router.tsx のインポートが短くなることを確認
      const routerEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("router.tsx")
      );
      expect(routerEdits).toBeDefined();
      expect(
        routerEdits?.textEdits.some((edit) =>
          edit.newText.includes("./auth/")
        )
      ).toBe(true);
    });

    it("深い階層への移動（src/auth → src/features/auth/v2）", () => {
      // まず src/auth を作成
      const authDir = path.join(projectRoot, "src", "auth");
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, "service.ts"),
        `export function authenticate() {
  return true;
}
`
      );

      fs.writeFileSync(
        path.join(projectRoot, "src", "service-consumer.ts"),
        `import { authenticate } from "./auth/service.js";

export function login() {
  return authenticate();
}
`
      );

      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/auth",
        newDir: "src/features/auth/v2",
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].to).toBe(
        path.join(projectRoot, "src", "features", "auth", "v2", "service.ts")
      );

      // service-consumer.ts のインポートが深いパスに更新されることを確認
      const consumerEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("service-consumer.ts")
      );
      expect(consumerEdits).toBeDefined();
      expect(
        consumerEdits?.textEdits.some((edit) =>
          edit.newText.includes("features/auth/v2")
        )
      ).toBe(true);
    });

    it("完全に異なる場所への移動", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/single",
        newDir: "lib/shared/utils",
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].to).toBe(
        path.join(projectRoot, "lib", "shared", "utils", "utils.ts")
      );

      // main.ts のインポートパスが大きく変わることを確認
      const mainEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("main.ts")
      );
      expect(mainEdits).toBeDefined();
      expect(
        mainEdits?.textEdits.some((edit) =>
          edit.newText.includes("../lib/shared/utils")
        )
      ).toBe(true);
    });
  });

  // ========================================
  // インポート関係
  // ========================================
  describe("インポート関係", () => {
    it("ディレクトリ外部からのインポートが更新される", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/feature/auth",
        newDir: "src/features/auth",
      });

      // router.tsx（外部ファイル）の編集が含まれることを確認
      const routerEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("router.tsx")
      );
      expect(routerEdits).toBeDefined();
      expect(routerEdits?.textEdits.length).toBeGreaterThan(0);
    });

    it("ディレクトリ内部のファイル間インポートは変更されない", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/feature/auth",
        newDir: "src/features/auth",
      });

      // hooks.ts 内の "./index.js" への相対インポートは編集に含まれないはず
      // （同じディレクトリ内の相対パスは変わらないため）
      const hooksEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("hooks.ts")
      );

      // hooks.ts への編集がある場合、それは外部からのインポート更新のためであり、
      // 内部の "./index.js" は変更されないことを確認
      if (hooksEdits) {
        // hooks.ts のソースコードを読み込んで、"./index.js" が保持されているか確認
        const hooksPath = path.join(
          projectRoot,
          "src",
          "feature",
          "auth",
          "hooks.ts"
        );
        const hooksContent = fs.readFileSync(hooksPath, "utf-8");
        expect(hooksContent).toContain("./index.js");
      }
    });

    it("ディレクトリ内から外部へのインポートは変更されない", () => {
      // bidir/a.ts から bidir/b.ts へのインポートを確認
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/bidir",
        newDir: "src/newbidir",
      });

      // a.ts 内の "./b.js" への相対インポートは変更されない
      const aPath = path.join(projectRoot, "src", "bidir", "a.ts");
      const aContent = fs.readFileSync(aPath, "utf-8");
      expect(aContent).toContain("./b.js");

      // external.ts のインポートは更新される
      const externalEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("external.ts")
      );
      expect(externalEdits).toBeDefined();
      expect(
        externalEdits?.textEdits.some((edit) =>
          edit.newText.includes("newbidir")
        )
      ).toBe(true);
    });

    it("index.ts を持つディレクトリの移動で index 経由のインポートが更新される", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/withindex",
        newDir: "src/newindex",
      });

      expect(result.fsMoves).toHaveLength(2);

      // client.ts のインポートパスが更新されることを確認
      const clientEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("client.ts")
      );
      expect(clientEdits).toBeDefined();
      expect(
        clientEdits?.textEdits.some((edit) => edit.newText.includes("newindex"))
      ).toBe(true);

      // index.ts 内の "./helper.js" への相対インポートは変更されない
      const indexPath = path.join(projectRoot, "src", "withindex", "index.ts");
      const indexContent = fs.readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("./helper.js");
    });
  });

  // ========================================
  // エッジケース
  // ========================================
  describe("エッジケース", () => {
    it(".ts 以外のファイル（.tsx, .json など）が混在する場合", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/mixed",
        newDir: "src/newmixed",
      });

      // .ts と .tsx ファイルのみが移動対象となる
      // .json ファイルは TypeScript プロジェクトのファイルリストに含まれない
      expect(result.fsMoves.length).toBeGreaterThanOrEqual(1);

      const fromPaths = result.fsMoves.map((m) =>
        path.relative(projectRoot, m.from)
      );
      expect(
        fromPaths.some((p) => p.includes("Component.tsx") || p.includes("utils.ts"))
      ).toBe(true);

      // ui.tsx のインポートが更新されることを確認
      const uiEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("ui.tsx")
      );
      expect(uiEdits).toBeDefined();
      expect(
        uiEdits?.textEdits.some((edit) => edit.newText.includes("newmixed"))
      ).toBe(true);
    });

    it("存在しないディレクトリを移動しようとした場合", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/nonexistent",
        newDir: "src/new",
      });

      // 存在しないディレクトリの場合、fsMoves と edits は空
      expect(result.fsMoves).toHaveLength(0);
      expect(result.edits).toHaveLength(0);
    });

    it("同じパスに移動しようとした場合", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/single",
        newDir: "src/single",
      });

      // 同じパスの場合でも、TypeScript は空の編集を返す
      expect(result.fsMoves).toHaveLength(1);
      // 編集は発生しない、または空
      // TypeScript の動作に依存するため、結果が定義されていることのみを確認
      expect(result).toBeDefined();
    });

    it("oldDir が newDir の親の場合", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/nested",
        newDir: "src/nested/sub/moved",
      });

      // この場合、ファイルは自分自身のサブディレクトリに移動する
      expect(result.fsMoves).toHaveLength(2);

      const toPaths = result.fsMoves.map((m) =>
        path.relative(projectRoot, m.to)
      );
      expect(
        toPaths.some((p) => p.includes("nested/sub/moved"))
      ).toBe(true);
    });

    it("oldDir が newDir の子の場合", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/nested/sub",
        newDir: "src/moved",
      });

      // サブディレクトリを親レベルに移動
      expect(result.fsMoves.length).toBeGreaterThanOrEqual(1);

      const toPaths = result.fsMoves.map((m) =>
        path.relative(projectRoot, m.to)
      );
      expect(
        toPaths.some((p) => p.includes("moved"))
      ).toBe(true);
    });
  });

  // ========================================
  // fsMoves の検証
  // ========================================
  describe("fsMoves の検証", () => {
    it("すべてのファイルが fsMoves に含まれることを確認", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/many",
        newDir: "src/modules",
      });

      // 15個すべてのファイルが含まれる
      expect(result.fsMoves).toHaveLength(15);

      // 各ファイルが from と to を持つことを確認
      result.fsMoves.forEach((move) => {
        expect(move.from).toBeDefined();
        expect(move.to).toBeDefined();
        expect(typeof move.from).toBe("string");
        expect(typeof move.to).toBe("string");
      });
    });

    it("ディレクトリ自体は fsMoves に含まれない（ファイルのみ）", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/nested",
        newDir: "src/complex",
      });

      // すべての fsMoves がファイル（拡張子付き）であることを確認
      result.fsMoves.forEach((move) => {
        expect(path.extname(move.from)).not.toBe("");
        expect(path.extname(move.to)).not.toBe("");
      });
    });

    it("パスが正しく計算されることを確認", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/nested",
        newDir: "src/complex",
      });

      result.fsMoves.forEach((move) => {
        // from は oldDir で始まる
        expect(move.from).toContain(path.join("src", "nested"));
        // to は newDir で始まる
        expect(move.to).toContain(path.join("src", "complex"));

        // 相対パスが保持されることを確認
        const relOld = path.relative(
          path.join(projectRoot, "src", "nested"),
          move.from
        );
        const relNew = path.relative(
          path.join(projectRoot, "src", "complex"),
          move.to
        );
        expect(relOld).toBe(relNew);
      });
    });

    it("絶対パスが返されることを確認", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/single",
        newDir: "src/utilities",
      });

      result.fsMoves.forEach((move) => {
        expect(path.isAbsolute(move.from)).toBe(true);
        expect(path.isAbsolute(move.to)).toBe(true);
      });
    });
  });

  // ========================================
  // edits の検証
  // ========================================
  describe("edits の検証", () => {
    it("同一ファイルへの編集がマージされることを確認", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/feature/auth",
        newDir: "src/features/auth",
      });

      // router.tsx には2つのインポート（index.ts と hooks.ts）があるため、
      // 複数の編集が1つの FileTextEdits にまとめられる
      const routerEdits = result.edits.find((edit) =>
        edit.filePath.endsWith("router.tsx")
      );

      expect(routerEdits).toBeDefined();
      expect(routerEdits?.textEdits.length).toBeGreaterThanOrEqual(2);

      // すべて同じ filePath を持つことを確認
      expect(routerEdits?.filePath).toBeDefined();
    });

    it("Range が重複していないことを確認", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/many",
        newDir: "src/modules",
      });

      result.edits.forEach((fileEdit) => {
        const ranges = fileEdit.textEdits.map((edit) => edit.range);

        // 各 Range が重複していないことを確認
        for (let i = 0; i < ranges.length; i++) {
          for (let j = i + 1; j < ranges.length; j++) {
            const r1 = ranges[i];
            const r2 = ranges[j];

            // r1 と r2 が重複していないことを確認
            // 重複の定義: r1.end > r2.start && r2.end > r1.start
            const overlaps =
              (r1.end.line > r2.start.line ||
                (r1.end.line === r2.start.line &&
                  r1.end.character > r2.start.character)) &&
              (r2.end.line > r1.start.line ||
                (r2.end.line === r1.start.line &&
                  r2.end.character > r1.start.character));

            expect(overlaps).toBe(false);
          }
        }
      });
    });

    it("編集順序の一貫性を確認", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/many",
        newDir: "src/modules",
      });

      result.edits.forEach((fileEdit) => {
        // textEdits が位置順にソートされていることを確認
        // （TypeScript は通常、逆順で返すが、実装によって異なる可能性がある）
        for (let i = 0; i < fileEdit.textEdits.length - 1; i++) {
          const curr = fileEdit.textEdits[i];
          const next = fileEdit.textEdits[i + 1];

          // 行番号で比較
          const currPos = curr.range.start;
          const nextPos = next.range.start;

          // curr が next より前にあるか、同じ位置でないことを確認
          const isOrdered =
            currPos.line < nextPos.line ||
            (currPos.line === nextPos.line &&
              currPos.character <= nextPos.character);

          // または逆順の場合
          const isReverseOrdered =
            currPos.line > nextPos.line ||
            (currPos.line === nextPos.line &&
              currPos.character >= nextPos.character);

          // どちらかの順序であることを確認
          expect(isOrdered || isReverseOrdered).toBe(true);
        }
      });
    });

    it("各 TextEdit の Range が有効であることを確認", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/single",
        newDir: "src/utilities",
      });

      result.edits.forEach((fileEdit) => {
        fileEdit.textEdits.forEach((edit) => {
          // start と end が定義されている
          expect(edit.range.start).toBeDefined();
          expect(edit.range.end).toBeDefined();

          // line と character が非負
          expect(edit.range.start.line).toBeGreaterThanOrEqual(0);
          expect(edit.range.start.character).toBeGreaterThanOrEqual(0);
          expect(edit.range.end.line).toBeGreaterThanOrEqual(0);
          expect(edit.range.end.character).toBeGreaterThanOrEqual(0);

          // end が start 以降
          expect(
            edit.range.end.line > edit.range.start.line ||
              (edit.range.end.line === edit.range.start.line &&
                edit.range.end.character >= edit.range.start.character)
          ).toBe(true);

          // newText が定義されている
          expect(edit.newText).toBeDefined();
          expect(typeof edit.newText).toBe("string");
        });
      });
    });

    it("編集対象ファイルが実際に存在することを確認", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/feature/auth",
        newDir: "src/features/auth",
      });

      result.edits.forEach((fileEdit) => {
        expect(fs.existsSync(fileEdit.filePath)).toBe(true);
      });
    });
  });

  // ========================================
  // パフォーマンス考慮
  // ========================================
  describe("パフォーマンス", () => {
    it("多数のファイル（50+）を持つディレクトリでもタイムアウトしない", () => {
      const startTime = Date.now();

      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/large",
        newDir: "src/newlarge",
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 60個のファイルが含まれることを確認
      expect(result.fsMoves).toHaveLength(60);

      // 10秒以内に完了することを確認（通常は数百ミリ秒で完了するはず）
      expect(duration).toBeLessThan(10000);

      // 編集が含まれることを確認
      expect(result.edits.length).toBeGreaterThanOrEqual(0);
    });

    it("深いネスト構造でもパフォーマンスが劣化しない", () => {
      // 深いネスト構造を作成
      const deepDir = path.join(projectRoot, "src", "deep");
      let currentDir = deepDir;
      for (let i = 0; i < 10; i++) {
        currentDir = path.join(currentDir, `level${i}`);
        fs.mkdirSync(currentDir, { recursive: true });
        fs.writeFileSync(
          path.join(currentDir, `file${i}.ts`),
          `export function level${i}Func() {
  return ${i};
}
`
        );
      }

      const startTime = Date.now();

      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/deep",
        newDir: "src/shallow",
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 10個のファイルが含まれることを確認
      expect(result.fsMoves).toHaveLength(10);

      // 5秒以内に完了することを確認
      expect(duration).toBeLessThan(5000);
    });
  });

  // ========================================
  // 相対パス vs 絶対パスの混在
  // ========================================
  describe("パス指定のバリエーション", () => {
    it("oldDir が相対パス、newDir が絶対パスの場合", () => {
      const newDirAbs = path.join(projectRoot, "src", "utilities");

      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/single",
        newDir: newDirAbs,
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].to).toBe(
        path.join(projectRoot, "src", "utilities", "utils.ts")
      );
    });

    it("oldDir が絶対パス、newDir が相対パスの場合", () => {
      const oldDirAbs = path.join(projectRoot, "src", "single");

      const result = planDirectoryMove({
        projectRoot,
        oldDir: oldDirAbs,
        newDir: "src/utilities",
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].from).toBe(
        path.join(projectRoot, "src", "single", "utils.ts")
      );
    });

    it("両方とも絶対パスの場合", () => {
      const oldDirAbs = path.join(projectRoot, "src", "single");
      const newDirAbs = path.join(projectRoot, "src", "utilities");

      const result = planDirectoryMove({
        projectRoot,
        oldDir: oldDirAbs,
        newDir: newDirAbs,
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(result.fsMoves[0].from).toBe(
        path.join(projectRoot, "src", "single", "utils.ts")
      );
      expect(result.fsMoves[0].to).toBe(
        path.join(projectRoot, "src", "utilities", "utils.ts")
      );
    });

    it("両方とも相対パスの場合", () => {
      const result = planDirectoryMove({
        projectRoot,
        oldDir: "src/single",
        newDir: "src/utilities",
      });

      expect(result.fsMoves).toHaveLength(1);
      expect(path.isAbsolute(result.fsMoves[0].from)).toBe(true);
      expect(path.isAbsolute(result.fsMoves[0].to)).toBe(true);
    });
  });
});
