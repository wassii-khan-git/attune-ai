import { dirname, resolve } from 'node:path';

import ts from 'typescript';

/**
 * Type-checks the app the way Vercel's builder does, and returns the errors.
 *
 * Vercel's Express preset compiles the entry file with `@vercel/node`, which
 * runs its own type check before deploying. That check differs from `tsc` in
 * two ways that have each failed a deployment of this app:
 *
 * 1. It edits the tsconfig before following `extends`: if the file names no
 *    `module`, it forces `strict: false`.
 * 2. It resolves every import without a resolution mode, so under NodeNext
 *    each one is resolved as if the importing file were CommonJS. A package
 *    with separate ES module and CommonJS types then gets the wrong ones.
 *
 * The logic below is a copy of `fixConfig` and of the language-service host in
 * `@vercel/node` 21.0.0. It exists so those failures show up in the test suite
 * and not on the deployment platform.
 */
export function vercelTypeCheck(appDirectory: string, entry = 'src/server.ts'): string[] {
  const configFileName = ts.findConfigFile(appDirectory, (path) => ts.sys.fileExists(path));
  if (configFileName === undefined) {
    throw new Error(`No tsconfig.json found from ${appDirectory}`);
  }

  const raw = ts.readConfigFile(configFileName, (path) => ts.sys.readFile(path)).config as {
    files?: string[];
    include?: string[];
    compilerOptions?: Record<string, unknown>;
  };
  raw.files = [];
  raw.include = [];
  const compilerOptions: Record<string, unknown> = {
    ...raw.compilerOptions,
    sourceMap: true,
    inlineSourceMap: false,
    inlineSources: true,
    declaration: false,
    noEmit: false,
    outDir: '$$ts-node$$',
  };
  compilerOptions.target ??= 'ES2021';
  compilerOptions.esModuleInterop ??= true;
  if (compilerOptions.module === undefined) {
    compilerOptions.module = 'NodeNext';
    compilerOptions.moduleResolution = 'NodeNext';
    compilerOptions.strict = false;
  }
  raw.compilerOptions = compilerOptions;

  const { options } = ts.parseJsonConfigFileContent(
    raw,
    ts.sys,
    dirname(configFileName),
    undefined,
    configFileName,
  );

  const contents = new Map<string, string>();
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...contents.keys()],
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      const text = contents.get(fileName) ?? ts.sys.readFile(fileName);
      if (text === undefined) {
        return undefined;
      }
      contents.set(fileName, text);
      return ts.ScriptSnapshot.fromString(text);
    },
    readFile: (path) => ts.sys.readFile(path),
    readDirectory: (...args) => ts.sys.readDirectory(...args),
    getDirectories: (path) => ts.sys.getDirectories(path),
    fileExists: (path) => ts.sys.fileExists(path),
    directoryExists: (path) => ts.sys.directoryExists(path),
    getNewLine: () => ts.sys.newLine,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    getCurrentDirectory: () => appDirectory,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
    // The second difference: no resolution mode is passed.
    resolveModuleNames: (names, containingFile) =>
      names.map(
        (name) => ts.resolveModuleName(name, containingFile, options, ts.sys).resolvedModule,
      ),
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  // Every source file reachable from the entry, which is what the builder compiles.
  const checked = new Set<string>();
  const queue = [resolve(appDirectory, entry)];
  const errors: string[] = [];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (checked.has(file)) {
      continue;
    }
    checked.add(file);
    contents.set(file, ts.sys.readFile(file) ?? '');

    const diagnostics = [
      ...service.getSemanticDiagnostics(file),
      ...service.getSyntacticDiagnostics(file),
    ].filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    for (const diagnostic of diagnostics) {
      const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      const location = `${file.replace(`${appDirectory}/`, '')}(${String((position?.line ?? 0) + 1)})`;
      errors.push(`${location}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    }

    for (const statement of service.getProgram()?.getSourceFile(file)?.statements ?? []) {
      const isImportOrExport =
        ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement);
      const specifier = isImportOrExport ? statement.moduleSpecifier : undefined;
      if (
        specifier !== undefined &&
        ts.isStringLiteral(specifier) &&
        specifier.text.startsWith('.')
      ) {
        const target = resolve(dirname(file), specifier.text.replace(/\.js$/, '.ts'));
        if (ts.sys.fileExists(target)) {
          queue.push(target);
        }
      }
    }
  }
  return errors;
}
