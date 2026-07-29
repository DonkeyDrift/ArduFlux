import * as vscode from "vscode";

export function formatStatusBarText(boardName: string, portAddress: string): string {
  const board = boardName.trim();
  const port = portAddress.trim();

  if (!board && !port) {
    return vscode.l10n.t("Not configured");
  }
  if (!board) {
    return vscode.l10n.t("Board not configured @ {0}", port);
  }
  if (!port) {
    return vscode.l10n.t("{0} @ No port selected", board);
  }
  return `${board} @ ${port}`;
}
