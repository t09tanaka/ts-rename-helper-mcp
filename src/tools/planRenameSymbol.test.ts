/**
 * planRenameSymbol のテスト
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { planRenameSymbol } from "./planRenameSymbol.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("planRenameSymbol", () => {
  let testProjectDir: string;

  beforeAll(() => {
    // テスト用のプロジェクトディレクトリを作成
    testProjectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ts-rename-test-")
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
        jsx: "react",
      },
      include: ["**/*.ts", "**/*.tsx"],
    };

    fs.writeFileSync(
      path.join(testProjectDir, "tsconfig.json"),
      JSON.stringify(tsconfigContent, null, 2)
    );

    // テスト用の TypeScript ファイルを作成
    // src/foo.ts
    fs.mkdirSync(path.join(testProjectDir, "src"));
    fs.writeFileSync(
      path.join(testProjectDir, "src", "foo.ts"),
      `export function getUserData() {
  return { name: "test" };
}
`
    );

    // src/bar.ts (foo.ts の関数を使用)
    fs.writeFileSync(
      path.join(testProjectDir, "src", "bar.ts"),
      `import { getUserData } from "./foo.js";

export function processUser() {
  const data = getUserData();
  return data;
}
`
    );
  });

  afterAll(() => {
    // テストディレクトリを削除
    fs.rmSync(testProjectDir, { recursive: true, force: true });
  });

  describe("基本機能", () => {
    it("should successfully rename a function symbol", () => {
      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/foo.ts",
        line: 0, // "export function getUserData()" の行
        character: 16, // "getUserData" の開始位置
        newName: "fetchUserData",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        // 少なくとも 2 ファイル (foo.ts と bar.ts) に編集が必要
        expect(result.edits.length).toBeGreaterThanOrEqual(2);

        // foo.ts に編集が含まれているか確認
        const fooEdit = result.edits.find((edit) =>
          edit.filePath.endsWith("foo.ts")
        );
        expect(fooEdit).toBeDefined();
        expect(fooEdit?.textEdits.length).toBeGreaterThan(0);
        expect(fooEdit?.textEdits[0].newText).toBe("fetchUserData");

        // bar.ts に編集が含まれているか確認
        const barEdit = result.edits.find((edit) =>
          edit.filePath.endsWith("bar.ts")
        );
        expect(barEdit).toBeDefined();
        expect(barEdit?.textEdits.length).toBeGreaterThan(0);
      }
    });

    it("should return canRename: false for non-existent file", () => {
      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/nonexistent.ts",
        line: 0,
        character: 0,
        newName: "newName",
      });

      expect(result.canRename).toBe(false);
      if (!result.canRename) {
        expect(result.reason).toContain("File not found");
      }
    });

    it("should return canRename: false for invalid tsconfig location", () => {
      const invalidProjectDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ts-rename-invalid-")
      );

      try {
        const result = planRenameSymbol({
          projectRoot: invalidProjectDir,
          filePath: "test.ts",
          line: 0,
          character: 0,
          newName: "newName",
        });

        expect(result.canRename).toBe(false);
        if (!result.canRename) {
          expect(result.reason).toContain("tsconfig.json not found");
        }
      } finally {
        fs.rmSync(invalidProjectDir, { recursive: true, force: true });
      }
    });

    it("should handle absolute file paths", () => {
      const absolutePath = path.join(testProjectDir, "src", "foo.ts");
      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: absolutePath,
        line: 0,
        character: 16,
        newName: "fetchUserData",
      });

      expect(result.canRename).toBe(true);
    });

    it("should respect findInStrings and findInComments options", () => {
      // コメントと文字列を含むファイルを作成
      const testFile = path.join(testProjectDir, "src", "withComments.ts");
      fs.writeFileSync(
        testFile,
        `export function myFunction() {
  // myFunction is called here
  const text = "myFunction";
  return 42;
}
`
      );

      // findInComments: false, findInStrings: false
      const resultDefault = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/withComments.ts",
        line: 0,
        character: 16,
        newName: "renamedFunction",
        findInComments: false,
        findInStrings: false,
      });

      expect(resultDefault.canRename).toBe(true);

      // findInComments: true, findInStrings: true
      const resultWithAll = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/withComments.ts",
        line: 0,
        character: 16,
        newName: "renamedFunction",
        findInComments: true,
        findInStrings: true,
      });

      expect(resultWithAll.canRename).toBe(true);

      // デフォルトの方が編集箇所が少ないはず
      if (resultDefault.canRename && resultWithAll.canRename) {
        const defaultEditsCount = resultDefault.edits.reduce(
          (sum, e) => sum + e.textEdits.length,
          0
        );
        const withAllEditsCount = resultWithAll.edits.reduce(
          (sum, e) => sum + e.textEdits.length,
          0
        );

        // コメントと文字列を含める場合は編集箇所が増える（または同じ）
        expect(withAllEditsCount).toBeGreaterThanOrEqual(defaultEditsCount);
      }
    });
  });

  describe("リネーム対象のバリエーション", () => {
    it("should rename local variable", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "localVar.ts"),
        `export function test() {
  const localValue = 42;
  return localValue + 1;
}
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/localVar.ts",
        line: 1,
        character: 8,
        newName: "updatedValue",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("localVar.ts"));
        expect(edits?.textEdits.length).toBe(2); // 定義と使用箇所
      }
    });

    it("should rename function parameter", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "param.ts"),
        `export function greet(userName: string) {
  return "Hello, " + userName;
}
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/param.ts",
        line: 0,
        character: 22,
        newName: "name",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("param.ts"));
        expect(edits?.textEdits.length).toBe(2); // パラメータと使用箇所
      }
    });

    it("should rename class name", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "classRename.ts"),
        `export class UserModel {
  name: string = "";
}

const user = new UserModel();
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/classRename.ts",
        line: 0,
        character: 13,
        newName: "User",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("classRename.ts"));
        expect(edits?.textEdits.length).toBe(2); // クラス定義と使用箇所
      }
    });

    it("should rename interface name", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "interfaceRename.ts"),
        `export interface UserData {
  name: string;
}

const data: UserData = { name: "test" };
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/interfaceRename.ts",
        line: 0,
        character: 17,
        newName: "User",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("interfaceRename.ts"));
        expect(edits?.textEdits.length).toBe(2); // インターフェース定義と使用箇所
      }
    });

    it("should rename type alias", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "typeAlias.ts"),
        `export type UserId = string;

const id: UserId = "123";
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/typeAlias.ts",
        line: 0,
        character: 12,
        newName: "ID",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("typeAlias.ts"));
        expect(edits?.textEdits.length).toBe(2); // 型エイリアス定義と使用箇所
      }
    });

    it("should rename enum name", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "enumRename.ts"),
        `export enum Status {
  Active = "active",
  Inactive = "inactive"
}

const current = Status.Active;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/enumRename.ts",
        line: 0,
        character: 12,
        newName: "UserStatus",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("enumRename.ts"));
        expect(edits?.textEdits.length).toBe(2); // enum定義と使用箇所
      }
    });

    it("should rename enum member", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "enumMember.ts"),
        `export enum Status {
  Active = "active",
  Inactive = "inactive"
}

const current = Status.Active;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/enumMember.ts",
        line: 1,
        character: 2,
        newName: "Enabled",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("enumMember.ts"));
        expect(edits?.textEdits.length).toBe(2); // メンバー定義と使用箇所
      }
    });

    it("should rename object literal property", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "objectProp.ts"),
        `export const config = {
  apiKey: "secret",
  timeout: 1000
};

console.log(config.apiKey);
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/objectProp.ts",
        line: 1,
        character: 2,
        newName: "apiToken",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("objectProp.ts"));
        expect(edits?.textEdits.length).toBe(2); // プロパティ定義と使用箇所
      }
    });

    it("should rename class property", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "classProp.ts"),
        `export class User {
  userName: string = "";

  getUserName() {
    return this.userName;
  }
}
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/classProp.ts",
        line: 1,
        character: 2,
        newName: "name",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("classProp.ts"));
        expect(edits?.textEdits.length).toBe(2); // プロパティ定義と使用箇所
      }
    });

    it("should rename class method", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "classMethod.ts"),
        `export class Calculator {
  addNumbers(a: number, b: number) {
    return a + b;
  }

  calculate() {
    return this.addNumbers(1, 2);
  }
}
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/classMethod.ts",
        line: 1,
        character: 2,
        newName: "add",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("classMethod.ts"));
        expect(edits?.textEdits.length).toBe(2); // メソッド定義と使用箇所
      }
    });

    it("should rename default export", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "defaultExport.ts"),
        `function helper() {
  return "help";
}

export default helper;
`
      );

      fs.writeFileSync(
        path.join(testProjectDir, "src", "importDefault.ts"),
        `import helper from "./defaultExport.js";

console.log(helper());
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/defaultExport.ts",
        line: 0,
        character: 9,
        newName: "utility",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        expect(result.edits.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("should rename named export", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "namedExport.ts"),
        `export const API_KEY = "secret";
`
      );

      fs.writeFileSync(
        path.join(testProjectDir, "src", "importNamed.ts"),
        `import { API_KEY } from "./namedExport.js";

console.log(API_KEY);
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/namedExport.ts",
        line: 0,
        character: 13,
        newName: "API_TOKEN",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        expect(result.edits.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("複数ファイルにまたがるリネーム", () => {
    it("should rename symbol used in 3+ files", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "shared.ts"),
        `export function sharedUtil() {
  return "shared";
}
`
      );

      fs.writeFileSync(
        path.join(testProjectDir, "src", "consumer1.ts"),
        `import { sharedUtil } from "./shared.js";
export const result1 = sharedUtil();
`
      );

      fs.writeFileSync(
        path.join(testProjectDir, "src", "consumer2.ts"),
        `import { sharedUtil } from "./shared.js";
export const result2 = sharedUtil();
`
      );

      fs.writeFileSync(
        path.join(testProjectDir, "src", "consumer3.ts"),
        `import { sharedUtil } from "./shared.js";
export const result3 = sharedUtil();
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/shared.ts",
        line: 0,
        character: 16,
        newName: "commonUtil",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        expect(result.edits.length).toBeGreaterThanOrEqual(4); // shared.ts + 3 consumers
      }
    });

    it("should rename re-exported symbol", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "original.ts"),
        `export function coreFunction() {
  return "core";
}
`
      );

      fs.writeFileSync(
        path.join(testProjectDir, "src", "reexport.ts"),
        `export { coreFunction } from "./original.js";
`
      );

      fs.writeFileSync(
        path.join(testProjectDir, "src", "useReexport.ts"),
        `import { coreFunction } from "./reexport.js";
console.log(coreFunction());
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/original.ts",
        line: 0,
        character: 16,
        newName: "mainFunction",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        expect(result.edits.length).toBeGreaterThanOrEqual(3);
      }
    });

    it("should rename symbol in namespace", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "namespace.ts"),
        `export namespace Utils {
  export function helperFunc() {
    return "help";
  }
}

const result = Utils.helperFunc();
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/namespace.ts",
        line: 1,
        character: 17,
        newName: "assist",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("namespace.ts"));
        expect(edits?.textEdits.length).toBe(2);
      }
    });
  });

  describe("エッジケース", () => {
    it("should handle symbol at file start (0,0)", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "fileStart.ts"),
        `const firstSymbol = 1;
console.log(firstSymbol);
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/fileStart.ts",
        line: 0,
        character: 6,
        newName: "firstVar",
      });

      expect(result.canRename).toBe(true);
    });

    it("should handle symbol at file end", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "fileEnd.ts"),
        `const lastSymbol = 1;`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/fileEnd.ts",
        line: 0,
        character: 6,
        newName: "lastVar",
      });

      expect(result.canRename).toBe(true);
    });

    it("should handle same-name variables in different scopes", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "scopes.ts"),
        `function outer() {
  const value = 1;
  return value;
}

function inner() {
  const value = 2;
  return value;
}
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/scopes.ts",
        line: 1,
        character: 8,
        newName: "outerValue",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("scopes.ts"));
        // outer関数内のvalueのみがリネームされる
        expect(edits?.textEdits.length).toBe(2);
        // inner関数のvalueは影響を受けない
        expect(edits?.textEdits.every(edit => edit.range.start.line < 5)).toBe(true);
      }
    });

    it("should return canRename: false for keywords", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "keyword.ts"),
        `const value = 1;
return value;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/keyword.ts",
        line: 1,
        character: 0, // "return" キーワードの位置
        newName: "whatever",
      });

      expect(result.canRename).toBe(false);
    });

    it("should return canRename: false for literals", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "literal.ts"),
        `const value = 42;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/literal.ts",
        line: 0,
        character: 14, // 数値リテラル "42" の位置
        newName: "whatever",
      });

      expect(result.canRename).toBe(false);
    });

    it("should handle empty file", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "empty.ts"),
        ``
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/empty.ts",
        line: 0,
        character: 0,
        newName: "whatever",
      });

      expect(result.canRename).toBe(false);
    });

    it("should handle file with syntax errors", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "syntaxError.ts"),
        `const value = ;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/syntaxError.ts",
        line: 0,
        character: 6,
        newName: "newValue",
      });

      // 構文エラーがあっても、シンボルが識別できればリネーム可能
      // TypeScriptのLanguage Serviceは寛容
      expect(result.canRename).toBe(true);
    });
  });

  describe("特殊な構文", () => {
    it("should rename destructured variable", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "destructure.ts"),
        `const obj = { userName: "test", age: 30 };
const { userName } = obj;
console.log(userName);
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/destructure.ts",
        line: 1,
        character: 8,
        newName: "name",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("destructure.ts"));
        // TypeScript LSは、オブジェクトのプロパティ定義、分割代入の変数名、使用箇所の3箇所を返す
        expect(edits?.textEdits.length).toBe(3);
      }
    });

    it("should rename property in destructuring", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "destructureProp.ts"),
        `interface User {
  userName: string;
}

const obj: User = { userName: "test" };
const { userName } = obj;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/destructureProp.ts",
        line: 1,
        character: 2,
        newName: "name",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("destructureProp.ts"));
        // TypeScript LSは、インターフェース定義と分割代入の2箇所を返す
        expect(edits?.textEdits.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("should rename symbol with spread operator", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "spread.ts"),
        `const baseConfig = { timeout: 1000 };
const config = { ...baseConfig, retries: 3 };
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/spread.ts",
        line: 0,
        character: 6,
        newName: "defaultConfig",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("spread.ts"));
        expect(edits?.textEdits.length).toBe(2);
      }
    });

    it("should rename symbol in JSX", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "jsx.tsx"),
        `function MyComponent() {
  return <div>Hello</div>;
}

const element = <MyComponent />;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/jsx.tsx",
        line: 0,
        character: 9,
        newName: "Greeting",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("jsx.tsx"));
        expect(edits?.textEdits.length).toBe(2);
      }
    });

    it("should rename JSX prop", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "jsxProp.tsx"),
        `interface Props {
  userName: string;
}

function User(props: Props) {
  return <div>{props.userName}</div>;
}

const element = <User userName="test" />;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/jsxProp.tsx",
        line: 1,
        character: 2,
        newName: "name",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("jsxProp.tsx"));
        expect(edits?.textEdits.length).toBeGreaterThanOrEqual(3);
      }
    });

    it("should rename generic type parameter", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "generic.ts"),
        `function identity<TypeParam>(arg: TypeParam): TypeParam {
  return arg;
}
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/generic.ts",
        line: 0,
        character: 18,
        newName: "T",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("generic.ts"));
        expect(edits?.textEdits.length).toBe(3); // 定義、引数の型、戻り値の型
      }
    });
  });

  describe("位置の境界テスト", () => {
    it("should rename when position is at symbol start", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "posStart.ts"),
        `const testSymbol = 1;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/posStart.ts",
        line: 0,
        character: 6, // "testSymbol" の先頭
        newName: "newSymbol",
      });

      expect(result.canRename).toBe(true);
    });

    it("should rename when position is at symbol end", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "posEnd.ts"),
        `const testSymbol = 1;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/posEnd.ts",
        line: 0,
        character: 15, // "testSymbol" の最後の "l"
        newName: "newSymbol",
      });

      expect(result.canRename).toBe(true);
    });

    it("should rename when position is in middle of symbol", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "posMiddle.ts"),
        `const testSymbol = 1;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/posMiddle.ts",
        line: 0,
        character: 10, // "testSymbol" の中間
        newName: "newSymbol",
      });

      expect(result.canRename).toBe(true);
    });

    it("should not rename when position is on a number literal", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "posLiteral.ts"),
        `const testSymbol = 12345;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/posLiteral.ts",
        line: 0,
        character: 21, // 数値リテラル "12345" の中の位置
        newName: "newSymbol",
      });

      expect(result.canRename).toBe(false);
    });

    it("should not rename when position is after symbol", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "posAfter.ts"),
        `const testSymbol = 1;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/posAfter.ts",
        line: 0,
        character: 17, // "=" の位置
        newName: "newSymbol",
      });

      expect(result.canRename).toBe(false);
    });
  });

  describe("Range の検証", () => {
    it("should return correct ranges for all edits", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "rangeTest.ts"),
        `export function testFunc() {
  return "test";
}

const result = testFunc();
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/rangeTest.ts",
        line: 0,
        character: 16,
        newName: "newFunc",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("rangeTest.ts"));
        expect(edits).toBeDefined();

        for (const textEdit of edits!.textEdits) {
          // Range が正しく設定されているか
          expect(textEdit.range.start.line).toBeGreaterThanOrEqual(0);
          expect(textEdit.range.start.character).toBeGreaterThanOrEqual(0);
          expect(textEdit.range.end.line).toBeGreaterThanOrEqual(textEdit.range.start.line);

          // 同じ行の場合、終了位置は開始位置より後
          if (textEdit.range.start.line === textEdit.range.end.line) {
            expect(textEdit.range.end.character).toBeGreaterThan(textEdit.range.start.character);
          }

          // newText が設定されているか
          expect(textEdit.newText).toBe("newFunc");
        }
      }
    });

    it("should not have multi-line ranges for simple renames", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "singleLine.ts"),
        `export const longVariableName = "test";
const usage = longVariableName;
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/singleLine.ts",
        line: 0,
        character: 13,
        newName: "short",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("singleLine.ts"));

        for (const textEdit of edits!.textEdits) {
          // シンプルなリネームでは、各編集は単一行内で完結する
          expect(textEdit.range.start.line).toBe(textEdit.range.end.line);
        }
      }
    });

    it("should have correct character positions for ranges", () => {
      fs.writeFileSync(
        path.join(testProjectDir, "src", "charPos.ts"),
        `const myVar = 1;
console.log(myVar);
`
      );

      const result = planRenameSymbol({
        projectRoot: testProjectDir,
        filePath: "src/charPos.ts",
        line: 0,
        character: 6,
        newName: "yourVar",
      });

      expect(result.canRename).toBe(true);
      if (result.canRename) {
        const edits = result.edits.find((e) => e.filePath.endsWith("charPos.ts"));

        // 1行目の編集: "myVar" (character 6-11)
        const firstEdit = edits!.textEdits.find(e => e.range.start.line === 0);
        expect(firstEdit).toBeDefined();
        expect(firstEdit!.range.start.character).toBe(6);
        expect(firstEdit!.range.end.character).toBe(11);

        // 2行目の編集: "myVar" (character 12-17)
        const secondEdit = edits!.textEdits.find(e => e.range.start.line === 1);
        expect(secondEdit).toBeDefined();
        expect(secondEdit!.range.start.character).toBe(12);
        expect(secondEdit!.range.end.character).toBe(17);
      }
    });
  });
});
