import * as vscode from 'vscode';

import { CodeLensResultCache } from '@/src/codelens/provider/cache/CodeLensResultCache';
import { SymbolHandlerRegistry } from '@/src/symbol/SymbolHandlerRegistry';
import { VsCodeWrapper } from '@/src/vscode/VsCodeWrapper';

const DEBOUNCE_MS = 250;
const CONCURRENCY = 5;

export class RelationCodeLensProvider implements vscode.CodeLensProvider {
  private readonly vsCodeWrapper: VsCodeWrapper;
  private readonly symbolHandlerRegistry: SymbolHandlerRegistry;
  private readonly codeLensResultCache: CodeLensResultCache;

  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingResolvers = new Map<string, ((lens: vscode.CodeLens[]) => void)[]>();

  public constructor(
    vscodeWrapper: VsCodeWrapper,
    symbolHandlerRegistry: SymbolHandlerRegistry,
    codeLensResultCache: CodeLensResultCache,
  ) {
    this.vsCodeWrapper = vscodeWrapper;
    this.symbolHandlerRegistry = symbolHandlerRegistry;
    this.codeLensResultCache = codeLensResultCache;
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    const cached = this.codeLensResultCache.get(document);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    const key = document.uri.fsPath;
    const version = document.version;

    return new Promise((resolve) => {
      const resolvers = this.pendingResolvers.get(key) ?? [];
      resolvers.push(resolve);
      this.pendingResolvers.set(key, resolvers);

      const existing = this.debounceTimers.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        this.debounceTimers.delete(key);
        const waiting = this.pendingResolvers.get(key) ?? [];
        this.pendingResolvers.delete(key);
        if (token.isCancellationRequested || document.version !== version) {
          for (const r of waiting) r([]);
          return;
        }
        this.computeCodeLenses(document).then((result) => {
          for (const r of waiting) r(result);
        });
      }, DEBOUNCE_MS);

      this.debounceTimers.set(key, timer);
    });
  }

  private async computeCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const symbols = await this.vsCodeWrapper.executeDocumentSymbolProvider(document.uri, document.version);
    if (symbols.length === 0) return [];

    const tasks = symbols
      .map((symbol) => {
        const handler = this.symbolHandlerRegistry.getSymbolHandlerBySymbolKind(symbol.kind);
        return handler ? () => handler.generateCodeLensFromSymbol(document, symbol) : null;
      })
      .filter((t): t is () => Promise<vscode.CodeLens[]> => t !== null);

    if (tasks.length === 0) return [];

    const results: vscode.CodeLens[] = [];
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = await Promise.all(tasks.slice(i, i + CONCURRENCY).map((t) => t()));
      results.push(...batch.flat());
    }

    this.codeLensResultCache.set(document, results);
    return results;
  }
}
