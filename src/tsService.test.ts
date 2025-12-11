/**
 * tsService のテスト
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTsService } from "./tsService.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("createTsService", () => {
  let testProjectDir: string;

  beforeAll(() => {
    // テスト用のプロジェクトディレクトリを作成
    testProjectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ts-service-test-")
    );

    // tsconfig.json を作成
    const tsconfigContent = {
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ["src/**/*.ts"],
    };

    fs.writeFileSync(
      path.join(testProjectDir, "tsconfig.json"),
      JSON.stringify(tsconfigContent, null, 2)
    );

    // テスト用のファイルを作成
    fs.mkdirSync(path.join(testProjectDir, "src"));
    fs.writeFileSync(
      path.join(testProjectDir, "src", "example.ts"),
      `export function greet(name: string) {
  return \`Hello, \${name}!\`;
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

  it("tsconfig.json が存在する場合、正常に Language Service を作成する", () => {
    const result = createTsService(testProjectDir);

    expect(result.service).toBeDefined();
    expect(result.projectRoot).toBe(path.resolve(testProjectDir));
    expect(result.parsedConfig).toBeDefined();
    expect(result.parsedConfig.fileNames.length).toBeGreaterThan(0);

    // src/example.ts が含まれていることを確認
    const hasExampleFile = result.parsedConfig.fileNames.some((file) =>
      file.endsWith("example.ts")
    );
    expect(hasExampleFile).toBe(true);
  });

  it("相対パスを渡した場合、絶対パスに正規化される", () => {
    const relativePath = path.relative(process.cwd(), testProjectDir);
    const result = createTsService(relativePath);

    expect(result.projectRoot).toBe(path.resolve(testProjectDir));
  });

  it("tsconfig.json が存在しない場合、エラーを投げる", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-service-empty-"));

    try {
      expect(() => createTsService(emptyDir)).toThrow(
        /tsconfig\.json not found/
      );
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("tsconfig.json の読み込みに失敗した場合、エラーを投げる", () => {
    const invalidDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ts-service-invalid-")
    );

    try {
      // 不正な JSON を含む tsconfig.json を作成
      fs.writeFileSync(
        path.join(invalidDir, "tsconfig.json"),
        "{ invalid json content"
      );

      expect(() => createTsService(invalidDir)).toThrow(
        /Failed to read tsconfig\.json/
      );
    } finally {
      fs.rmSync(invalidDir, { recursive: true, force: true });
    }
  });

  it("tsconfig.json のパースに失敗した場合、エラーを投げる", () => {
    const invalidDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ts-service-invalid-config-")
    );

    try {
      // 不正な設定を含む tsconfig.json を作成
      const invalidConfig = {
        compilerOptions: {
          target: "InvalidTarget", // 不正なターゲット
        },
      };

      fs.writeFileSync(
        path.join(invalidDir, "tsconfig.json"),
        JSON.stringify(invalidConfig, null, 2)
      );

      expect(() => createTsService(invalidDir)).toThrow(
        /Failed to parse tsconfig\.json/
      );
    } finally {
      fs.rmSync(invalidDir, { recursive: true, force: true });
    }
  });

  it("Language Service が正しく動作する（基本的なチェック）", () => {
    const result = createTsService(testProjectDir);
    const exampleFilePath = path.join(testProjectDir, "src", "example.ts");

    // getSemanticDiagnostics を呼び出してエラーがないことを確認
    const diagnostics = result.service.getSemanticDiagnostics(exampleFilePath);

    // 構文エラーや型エラーがないことを確認
    const errors = diagnostics.filter(
      (d) =>
        d.category === 1 /* Error */ ||
        d.category === 3 /* Message (fatal) */
    );
    expect(errors.length).toBe(0);
  });
});

describe("createTsService - プロジェクト構造のバリエーション", () => {
  describe("複数のソースディレクトリを持つプロジェクト", () => {
    let multiSourceDir: string;

    beforeAll(() => {
      multiSourceDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ts-service-multi-src-")
      );

      // tsconfig.json を作成（複数のソースディレクトリを含む）
      const tsconfigContent = {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
        },
        include: ["src/**/*.ts", "lib/**/*.ts"],
      };

      fs.writeFileSync(
        path.join(multiSourceDir, "tsconfig.json"),
        JSON.stringify(tsconfigContent, null, 2)
      );

      // src と lib ディレクトリを作成
      fs.mkdirSync(path.join(multiSourceDir, "src"));
      fs.mkdirSync(path.join(multiSourceDir, "lib"));

      fs.writeFileSync(
        path.join(multiSourceDir, "src", "main.ts"),
        `export const mainValue = 42;`
      );

      fs.writeFileSync(
        path.join(multiSourceDir, "lib", "helper.ts"),
        `export const helperValue = 100;`
      );
    });

    afterAll(() => {
      if (multiSourceDir && fs.existsSync(multiSourceDir)) {
        fs.rmSync(multiSourceDir, { recursive: true, force: true });
      }
    });

    it("複数のソースディレクトリのファイルが全て含まれる", () => {
      const result = createTsService(multiSourceDir);

      expect(result.parsedConfig.fileNames.length).toBe(2);

      const hasMainFile = result.parsedConfig.fileNames.some((file) =>
        file.endsWith("main.ts")
      );
      const hasHelperFile = result.parsedConfig.fileNames.some((file) =>
        file.endsWith("helper.ts")
      );

      expect(hasMainFile).toBe(true);
      expect(hasHelperFile).toBe(true);
    });
  });

  describe("ネストした tsconfig.json（extends を使用）", () => {
    let extendsDir: string;

    beforeAll(() => {
      extendsDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ts-service-extends-")
      );

      // base tsconfig.json を作成
      const baseTsconfigContent = {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          strict: true,
        },
      };

      fs.writeFileSync(
        path.join(extendsDir, "tsconfig.base.json"),
        JSON.stringify(baseTsconfigContent, null, 2)
      );

      // extends を使用する tsconfig.json を作成
      const tsconfigContent = {
        extends: "./tsconfig.base.json",
        compilerOptions: {
          esModuleInterop: true,
        },
        include: ["src/**/*.ts"],
      };

      fs.writeFileSync(
        path.join(extendsDir, "tsconfig.json"),
        JSON.stringify(tsconfigContent, null, 2)
      );

      // テスト用のファイルを作成
      fs.mkdirSync(path.join(extendsDir, "src"));
      fs.writeFileSync(
        path.join(extendsDir, "src", "index.ts"),
        `export const value = 1;`
      );
    });

    afterAll(() => {
      if (extendsDir && fs.existsSync(extendsDir)) {
        fs.rmSync(extendsDir, { recursive: true, force: true });
      }
    });

    it("extends を使用した tsconfig.json を正しく解決する", () => {
      const result = createTsService(extendsDir);

      expect(result.service).toBeDefined();
      expect(result.parsedConfig.options.strict).toBe(true); // base から継承
      expect(result.parsedConfig.options.esModuleInterop).toBe(true); // 上書き

      const hasIndexFile = result.parsedConfig.fileNames.some((file) =>
        file.endsWith("index.ts")
      );
      expect(hasIndexFile).toBe(true);
    });
  });

  describe("空の include 配列の場合", () => {
    let emptyIncludeDir: string;

    beforeAll(() => {
      emptyIncludeDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ts-service-empty-include-")
      );

      // 空の include 配列を持つ tsconfig.json を作成
      const tsconfigContent = {
        compilerOptions: {
          target: "ES2020",
        },
        include: [],
      };

      fs.writeFileSync(
        path.join(emptyIncludeDir, "tsconfig.json"),
        JSON.stringify(tsconfigContent, null, 2)
      );

      // ファイルを作成（include されないはず）
      fs.writeFileSync(
        path.join(emptyIncludeDir, "test.ts"),
        `export const test = 1;`
      );
    });

    afterAll(() => {
      if (emptyIncludeDir && fs.existsSync(emptyIncludeDir)) {
        fs.rmSync(emptyIncludeDir, { recursive: true, force: true });
      }
    });

    it("空の include 配列の場合、エラーを投げる", () => {
      expect(() => createTsService(emptyIncludeDir)).toThrow(
        /Failed to parse tsconfig\.json.*TS18003/
      );
    });
  });
});

describe("createTsService - エッジケース", () => {
  describe("projectRoot が空文字列の場合", () => {
    it("カレントディレクトリを使用する", () => {
      // 現在のディレクトリに tsconfig.json が存在する場合
      const currentDir = process.cwd();
      const hasTsconfig = fs.existsSync(path.join(currentDir, "tsconfig.json"));

      if (hasTsconfig) {
        const result = createTsService("");
        expect(result.projectRoot).toBe(currentDir);
      } else {
        expect(() => createTsService("")).toThrow(/tsconfig\.json not found/);
      }
    });
  });

  describe("projectRoot が存在しないディレクトリの場合", () => {
    it("エラーを投げる", () => {
      const nonExistentDir = path.join(
        os.tmpdir(),
        "non-existent-dir-" + Date.now()
      );

      expect(() => createTsService(nonExistentDir)).toThrow(
        /tsconfig\.json not found/
      );
    });
  });

  describe("tsconfig.json が空のオブジェクト {} の場合", () => {
    let emptyConfigDir: string;

    beforeAll(() => {
      emptyConfigDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ts-service-empty-config-")
      );

      fs.writeFileSync(path.join(emptyConfigDir, "tsconfig.json"), "{}");

      fs.writeFileSync(
        path.join(emptyConfigDir, "test.ts"),
        `export const test = 1;`
      );
    });

    afterAll(() => {
      if (emptyConfigDir && fs.existsSync(emptyConfigDir)) {
        fs.rmSync(emptyConfigDir, { recursive: true, force: true });
      }
    });

    it("デフォルト設定で Language Service を作成する", () => {
      const result = createTsService(emptyConfigDir);

      expect(result.service).toBeDefined();
      expect(result.parsedConfig).toBeDefined();
      // 空の設定でも Language Service は作成できる
    });
  });

  describe("compilerOptions が空の場合", () => {
    let noCompilerOptionsDir: string;

    beforeAll(() => {
      noCompilerOptionsDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ts-service-no-compiler-options-")
      );

      const tsconfigContent = {
        include: ["*.ts"],
      };

      fs.writeFileSync(
        path.join(noCompilerOptionsDir, "tsconfig.json"),
        JSON.stringify(tsconfigContent, null, 2)
      );

      fs.writeFileSync(
        path.join(noCompilerOptionsDir, "test.ts"),
        `export const test = 1;`
      );
    });

    afterAll(() => {
      if (noCompilerOptionsDir && fs.existsSync(noCompilerOptionsDir)) {
        fs.rmSync(noCompilerOptionsDir, { recursive: true, force: true });
      }
    });

    it("compilerOptions がない場合でも Language Service を作成する", () => {
      const result = createTsService(noCompilerOptionsDir);

      expect(result.service).toBeDefined();
      expect(result.parsedConfig.fileNames.length).toBeGreaterThan(0);

      const hasTestFile = result.parsedConfig.fileNames.some((file) =>
        file.endsWith("test.ts")
      );
      expect(hasTestFile).toBe(true);
    });
  });
});

describe("createTsService - LanguageService の動作確認", () => {
  describe("複数ファイルを持つプロジェクトでの動作", () => {
    let multiFileDir: string;

    beforeAll(() => {
      multiFileDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ts-service-multi-file-")
      );

      const tsconfigContent = {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
        },
        include: ["src/**/*.ts"],
      };

      fs.writeFileSync(
        path.join(multiFileDir, "tsconfig.json"),
        JSON.stringify(tsconfigContent, null, 2)
      );

      fs.mkdirSync(path.join(multiFileDir, "src"));

      // 複数のファイルを作成
      fs.writeFileSync(
        path.join(multiFileDir, "src", "module1.ts"),
        `export const value1 = 10;`
      );

      fs.writeFileSync(
        path.join(multiFileDir, "src", "module2.ts"),
        `import { value1 } from "./module1";
export const value2 = value1 + 20;`
      );

      fs.writeFileSync(
        path.join(multiFileDir, "src", "main.ts"),
        `import { value2 } from "./module2";
console.log(value2);`
      );
    });

    afterAll(() => {
      if (multiFileDir && fs.existsSync(multiFileDir)) {
        fs.rmSync(multiFileDir, { recursive: true, force: true });
      }
    });

    it("複数ファイル間の依存関係を正しく解決する", () => {
      const result = createTsService(multiFileDir);

      expect(result.parsedConfig.fileNames.length).toBe(3);

      // main.ts に対してセマンティック診断を実行
      const mainFilePath = path.join(multiFileDir, "src", "main.ts");
      const diagnostics = result.service.getSemanticDiagnostics(mainFilePath);

      const errors = diagnostics.filter((d) => d.category === 1 /* Error */);
      expect(errors.length).toBe(0);
    });

    it("ファイル間の型情報を正しく取得できる", () => {
      const result = createTsService(multiFileDir);

      const module2Path = path.join(multiFileDir, "src", "module2.ts");
      const program = result.service.getProgram();
      const sourceFile = program?.getSourceFile(module2Path);

      expect(sourceFile).toBeDefined();
    });
  });

  describe("型エラーを含むファイルがある場合の動作", () => {
    let typeErrorDir: string;

    beforeAll(() => {
      typeErrorDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ts-service-type-error-")
      );

      const tsconfigContent = {
        compilerOptions: {
          target: "ES2020",
          strict: true,
        },
        include: ["*.ts"],
      };

      fs.writeFileSync(
        path.join(typeErrorDir, "tsconfig.json"),
        JSON.stringify(tsconfigContent, null, 2)
      );

      // 型エラーを含むファイルを作成
      fs.writeFileSync(
        path.join(typeErrorDir, "error.ts"),
        `const num: number = "string"; // 型エラー`
      );
    });

    afterAll(() => {
      if (typeErrorDir && fs.existsSync(typeErrorDir)) {
        fs.rmSync(typeErrorDir, { recursive: true, force: true });
      }
    });

    it("型エラーがあっても Language Service は作成できる", () => {
      const result = createTsService(typeErrorDir);

      expect(result.service).toBeDefined();
    });

    it("型エラーを正しく検出できる", () => {
      const result = createTsService(typeErrorDir);

      const errorFilePath = path.join(typeErrorDir, "error.ts");
      const diagnostics = result.service.getSemanticDiagnostics(errorFilePath);

      const errors = diagnostics.filter((d) => d.category === 1 /* Error */);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe(".tsx ファイルを含むプロジェクト", () => {
    let tsxDir: string;

    beforeAll(() => {
      tsxDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-service-tsx-"));

      const tsconfigContent = {
        compilerOptions: {
          target: "ES2020",
          jsx: "react",
        },
        include: ["src/**/*.tsx", "src/**/*.ts"],
      };

      fs.writeFileSync(
        path.join(tsxDir, "tsconfig.json"),
        JSON.stringify(tsconfigContent, null, 2)
      );

      fs.mkdirSync(path.join(tsxDir, "src"));

      // .tsx ファイルを作成
      fs.writeFileSync(
        path.join(tsxDir, "src", "Component.tsx"),
        `import React from "react";
export const Component = () => <div>Hello</div>;`
      );

      // .ts ファイルも作成
      fs.writeFileSync(
        path.join(tsxDir, "src", "utils.ts"),
        `export const add = (a: number, b: number) => a + b;`
      );
    });

    afterAll(() => {
      if (tsxDir && fs.existsSync(tsxDir)) {
        fs.rmSync(tsxDir, { recursive: true, force: true });
      }
    });

    it(".tsx ファイルと .ts ファイルの両方を含む", () => {
      const result = createTsService(tsxDir);

      expect(result.parsedConfig.fileNames.length).toBe(2);

      const hasTsxFile = result.parsedConfig.fileNames.some((file) =>
        file.endsWith(".tsx")
      );
      const hasTsFile = result.parsedConfig.fileNames.some((file) =>
        file.endsWith("utils.ts")
      );

      expect(hasTsxFile).toBe(true);
      expect(hasTsFile).toBe(true);
    });
  });

  describe("node_modules 配下のファイルが除外されることの確認", () => {
    let nodeModulesDir: string;

    beforeAll(() => {
      nodeModulesDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ts-service-node-modules-")
      );

      const tsconfigContent = {
        compilerOptions: {
          target: "ES2020",
        },
        include: ["**/*.ts"],
        exclude: ["node_modules"],
      };

      fs.writeFileSync(
        path.join(nodeModulesDir, "tsconfig.json"),
        JSON.stringify(tsconfigContent, null, 2)
      );

      // src ディレクトリとファイルを作成
      fs.mkdirSync(path.join(nodeModulesDir, "src"));
      fs.writeFileSync(
        path.join(nodeModulesDir, "src", "main.ts"),
        `export const main = 1;`
      );

      // node_modules ディレクトリとファイルを作成
      fs.mkdirSync(path.join(nodeModulesDir, "node_modules"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(nodeModulesDir, "node_modules", "package.ts"),
        `export const package = 1;`
      );
    });

    afterAll(() => {
      if (nodeModulesDir && fs.existsSync(nodeModulesDir)) {
        fs.rmSync(nodeModulesDir, { recursive: true, force: true });
      }
    });

    it("node_modules 配下のファイルは含まれない", () => {
      const result = createTsService(nodeModulesDir);

      const hasMainFile = result.parsedConfig.fileNames.some((file) =>
        file.includes("src/main.ts")
      );
      const hasNodeModulesFile = result.parsedConfig.fileNames.some((file) =>
        file.includes("node_modules")
      );

      expect(hasMainFile).toBe(true);
      expect(hasNodeModulesFile).toBe(false);
    });
  });
});

describe("createTsService - パス処理", () => {
  describe("projectRoot に末尾スラッシュがある場合", () => {
    let trailingSlashDir: string;

    beforeAll(() => {
      trailingSlashDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ts-service-trailing-slash-")
      );

      const tsconfigContent = {
        compilerOptions: {
          target: "ES2020",
        },
        include: ["*.ts"],
      };

      fs.writeFileSync(
        path.join(trailingSlashDir, "tsconfig.json"),
        JSON.stringify(tsconfigContent, null, 2)
      );

      fs.writeFileSync(
        path.join(trailingSlashDir, "test.ts"),
        `export const test = 1;`
      );
    });

    afterAll(() => {
      if (trailingSlashDir && fs.existsSync(trailingSlashDir)) {
        fs.rmSync(trailingSlashDir, { recursive: true, force: true });
      }
    });

    it("末尾スラッシュがあっても正しく処理される", () => {
      const pathWithTrailingSlash = trailingSlashDir + path.sep;
      const result = createTsService(pathWithTrailingSlash);

      // 正規化されたパスが返される（末尾スラッシュなし）
      expect(result.projectRoot).toBe(path.resolve(trailingSlashDir));
      expect(result.service).toBeDefined();
    });
  });

  describe("日本語パスを含む場合", () => {
    let japanesePathDir: string;

    beforeAll(() => {
      // 日本語を含むディレクトリ名を作成
      const tmpDir = os.tmpdir();
      japanesePathDir = path.join(
        tmpDir,
        `ts-service-テスト-${Date.now()}`
      );

      fs.mkdirSync(japanesePathDir);

      const tsconfigContent = {
        compilerOptions: {
          target: "ES2020",
        },
        include: ["*.ts"],
      };

      fs.writeFileSync(
        path.join(japanesePathDir, "tsconfig.json"),
        JSON.stringify(tsconfigContent, null, 2)
      );

      fs.writeFileSync(
        path.join(japanesePathDir, "テスト.ts"),
        `export const テスト変数 = 1;`
      );
    });

    afterAll(() => {
      if (japanesePathDir && fs.existsSync(japanesePathDir)) {
        fs.rmSync(japanesePathDir, { recursive: true, force: true });
      }
    });

    it("日本語パスでも正しく Language Service を作成する", () => {
      const result = createTsService(japanesePathDir);

      expect(result.service).toBeDefined();
      expect(result.projectRoot).toBe(path.resolve(japanesePathDir));

      const hasJapaneseFile = result.parsedConfig.fileNames.some((file) =>
        file.includes("テスト.ts")
      );
      expect(hasJapaneseFile).toBe(true);
    });

    it("日本語ファイル名のファイルに対して診断を実行できる", () => {
      const result = createTsService(japanesePathDir);

      const japaneseFilePath = path.join(japanesePathDir, "テスト.ts");
      const diagnostics = result.service.getSemanticDiagnostics(japaneseFilePath);

      // エラーがないことを確認
      const errors = diagnostics.filter((d) => d.category === 1 /* Error */);
      expect(errors.length).toBe(0);
    });
  });
});
