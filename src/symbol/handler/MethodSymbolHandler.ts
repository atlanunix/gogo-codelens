import * as vscode from 'vscode';

import { CodeLensMaker } from '@/src/codelens/CodeLensMaker';
import { SymbolHandleable } from '@/src/symbol/handler/SymbolHandleable';
import { VsCodeWrapper } from '@/src/vscode/VsCodeWrapper';

export class MethodSymbolHandler implements SymbolHandleable {
  protected readonly symbolKind: vscode.SymbolKind = vscode.SymbolKind.Method;

  private readonly vsCodeWrapper: VsCodeWrapper;
  private readonly implementFromCodeLensMaker: CodeLensMaker;
  private readonly referenceCodeLensMaker: CodeLensMaker;

  public constructor(
    vsCodeWrapper: VsCodeWrapper,
    implementFromCodeLensMaker: CodeLensMaker,
    referenceCodeLensMaker: CodeLensMaker,
  ) {
    this.vsCodeWrapper = vsCodeWrapper;
    this.implementFromCodeLensMaker = implementFromCodeLensMaker;
    this.referenceCodeLensMaker = referenceCodeLensMaker;
  }

  public getSymbolKind(): vscode.SymbolKind {
    return this.symbolKind;
  }

  public async generateCodeLensFromSymbol(
    document: vscode.TextDocument,
    symbol: vscode.DocumentSymbol,
  ): Promise<vscode.CodeLens[]> {
    const methodNamePosition = this.getMethodCharPosition(document, symbol.range);
    const promises: Promise<vscode.CodeLens | null>[] = [];

    promises.push(
      this.generateImplementationCodeLens(document, symbol, this.implementFromCodeLensMaker, methodNamePosition),
    );
    promises.push(this.generateReferenceCodeLens(document, symbol, this.referenceCodeLensMaker, methodNamePosition));

    const results = await Promise.all(promises);
    return results.filter((lens): lens is vscode.CodeLens => lens !== null);
  }

  private async generateReferenceCodeLens(
    document: vscode.TextDocument,
    symbol: vscode.DocumentSymbol,
    codeLensMaker: CodeLensMaker,
    position: vscode.Position,
  ): Promise<vscode.CodeLens | null> {
    if (!codeLensMaker.getShouldShow()) {
      return null;
    }

    const referenceLocations = await this.vsCodeWrapper.executeReferenceProvider(
      document.uri,
      position.line,
      position.character,
    );

    const nonSelfReferenceLocations = referenceLocations.filter(
      (e) => !(e.range.start.line === position.line && e.uri.fsPath === document.uri.fsPath),
    );

    if (nonSelfReferenceLocations.length > 0 || codeLensMaker.isEmptyTitleTextConfigure()) {
      return codeLensMaker.build(document.uri, symbol.range, nonSelfReferenceLocations);
    }

    return null;
  }

  private async generateImplementationCodeLens(
    document: vscode.TextDocument,
    symbol: vscode.DocumentSymbol,
    codeLensMaker: CodeLensMaker,
    position: vscode.Position,
  ): Promise<vscode.CodeLens | null> {
    if (!codeLensMaker.getShouldShow()) {
      return null;
    }

    const implementationLocations = await this.vsCodeWrapper.executeImplementationProvider(
      document.uri,
      position.line,
      position.character,
    );

    if (implementationLocations.length > 0 || codeLensMaker.isEmptyTitleTextConfigure()) {
      return codeLensMaker.build(document.uri, symbol.range, implementationLocations);
    }

    return null;
  }

  private getMethodCharPosition(document: vscode.TextDocument, range: vscode.Range): vscode.Position {
    // Go method signature: "func (recv Type) MethodName(" — find the name after the receiver closing paren
    const firstLine = document.lineAt(range.start.line).text;
    // Fast path: single-line receiver "(recv) Name("
    const match = firstLine.match(/^func\s*\([^)]*\)\s*(\w)/);
    if (match && match.index !== undefined) {
      const nameStart = firstLine.indexOf(match[1], match.index + match[0].length - 1);
      return new vscode.Position(range.start.line, nameStart);
    }

    // Multi-line receiver: scan until receiver paren closes, then find name
    let depth = 0;
    let foundOpen = false;
    for (let ln = range.start.line; ln <= Math.min(range.start.line + 10, range.end.line); ln++) {
      const text = document.lineAt(ln).text;
      for (let ci = 0; ci < text.length; ci++) {
        const ch = text[ci];
        if (ch === '(') { depth++; foundOpen = true; }
        else if (ch === ')') {
          depth--;
          if (foundOpen && depth === 0) {
            // name starts after whitespace following this ')'
            let ni = ci + 1;
            while (ni < text.length && text[ni] === ' ') ni++;
            if (ni < text.length) return new vscode.Position(ln, ni);
          }
        }
      }
    }

    return new vscode.Position(range.start.line, 0);
  }
}
