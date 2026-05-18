import * as vscode from 'vscode';

type executeDocumentSymbolProviderResponse = (vscode.SymbolInformation & vscode.DocumentSymbol)[];

export class VsCodeWrapper {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  private dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const p = fn().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  public async executeDocumentSymbolProvider(
    uri: vscode.Uri,
    version?: number,
  ): Promise<executeDocumentSymbolProviderResponse> {
    return this.dedupe(`sym:${uri.fsPath}:${version ?? ''}`, () =>
      vscode.commands.executeCommand<executeDocumentSymbolProviderResponse>(
        'vscode.executeDocumentSymbolProvider',
        uri,
      ),
    );
  }

  public async executeImplementationProvider(
    uri: vscode.Uri,
    line: number,
    character: number,
  ): Promise<vscode.Location[]> {
    return this.dedupe(`impl:${uri.fsPath}:${line}:${character}`, () =>
      vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeImplementationProvider',
        uri,
        new vscode.Position(line, character),
      ),
    );
  }

  public async executeReferenceProvider(
    uri: vscode.Uri,
    line: number,
    character: number,
  ): Promise<vscode.Location[]> {
    return this.dedupe(`ref:${uri.fsPath}:${line}:${character}`, () =>
      vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        uri,
        new vscode.Position(line, character),
      ),
    );
  }
}
