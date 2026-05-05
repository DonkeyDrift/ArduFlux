"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatStatusBarText = formatStatusBarText;
function formatStatusBarText(boardName, portAddress) {
    const board = boardName.trim();
    const port = portAddress.trim();
    if (!board && !port) {
        return "未配置";
    }
    if (!board) {
        return `未配置板型 @ ${port}`;
    }
    if (!port) {
        return `${board} @ 未选择端口`;
    }
    return `${board} @ ${port}`;
}
//# sourceMappingURL=statusBar.js.map