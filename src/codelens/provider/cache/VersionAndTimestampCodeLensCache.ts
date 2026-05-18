import * as vscode from 'vscode';
import { CodeLens, TextDocument } from 'vscode';

import { CodeLensResultCache } from '@/src/codelens/provider/cache/CodeLensResultCache';

type CacheInformation = { version: number; codeLens: vscode.CodeLens[] };

export class VersionAndTimestampCodeLensCache implements CodeLensResultCache {
  private cacheByFsPath: Map<string, CacheInformation> = new Map();

  public get(document: TextDocument): CodeLens[] | undefined {
    const cache = this.cacheByFsPath.get(document.uri.fsPath);
    if (cache?.version === document.version) {
      return cache.codeLens;
    }
    return undefined;
  }

  public set(document: TextDocument, codeLenses: CodeLens[]): void {
    this.cacheByFsPath.set(document.uri.fsPath, {
      version: document.version,
      codeLens: codeLenses,
    });
  }
}
