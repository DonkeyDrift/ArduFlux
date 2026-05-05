"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const types_1 = require("../types");
describe("types.ts", () => {
    describe("CONFIG_FILE_NAME", () => {
        it("应为 embedded_board_config.json", () => {
            (0, chai_1.expect)(types_1.CONFIG_FILE_NAME).to.equal("embedded_board_config.json");
        });
    });
    describe("createDefaultConfig()", () => {
        it("应返回 schemaVersion 为 1 的默认配置", () => {
            const config = (0, types_1.createDefaultConfig)();
            (0, chai_1.expect)(config.schemaVersion).to.equal(1);
        });
        it("应包含 default profile", () => {
            const config = (0, types_1.createDefaultConfig)();
            (0, chai_1.expect)(config.profiles).to.have.property("default");
            (0, chai_1.expect)(config.profiles.default).to.deep.equal({});
        });
        it("默认板型应为 ESP32-S3 (Generic)", () => {
            const config = (0, types_1.createDefaultConfig)();
            (0, chai_1.expect)(config.current.board.name).to.equal("ESP32-S3 (Generic)");
            (0, chai_1.expect)(config.current.board.fqbn).to.equal("esp32:esp32:esp32s3");
        });
        it("默认串口应为空且启用自动选择", () => {
            const config = (0, types_1.createDefaultConfig)();
            (0, chai_1.expect)(config.current.port.address).to.equal("");
            (0, chai_1.expect)(config.current.port.auto).to.be.true;
        });
        it("默认监视器参数应正确", () => {
            const config = (0, types_1.createDefaultConfig)();
            const monitor = config.current.monitor;
            (0, chai_1.expect)(monitor.enabled).to.be.true;
            (0, chai_1.expect)(monitor.baudRate).to.equal(115200);
            (0, chai_1.expect)(monitor.dataBits).to.equal(8);
            (0, chai_1.expect)(monitor.stopBits).to.equal(1);
            (0, chai_1.expect)(monitor.parity).to.equal("none");
            (0, chai_1.expect)(monitor.newline).to.equal("CRLF");
        });
        it("应返回深拷贝，修改不影响默认值", () => {
            const a = (0, types_1.createDefaultConfig)();
            const b = (0, types_1.createDefaultConfig)();
            a.current.board.name = "Modified";
            (0, chai_1.expect)(b.current.board.name).to.equal("ESP32-S3 (Generic)");
        });
    });
    describe("DEFAULT_BOARD_CATALOG", () => {
        it("应至少包含 ESP32-S3、ESP32 Dev、Arduino Uno", () => {
            const names = types_1.DEFAULT_BOARD_CATALOG.map((b) => b.name);
            (0, chai_1.expect)(names).to.include("ESP32-S3 (Generic)");
            (0, chai_1.expect)(names).to.include("ESP32 Dev Module");
            (0, chai_1.expect)(names).to.include("Arduino Uno");
        });
        it("每个预置板型都应具备 name、fqbn、compileArgs、pinDefines", () => {
            for (const item of types_1.DEFAULT_BOARD_CATALOG) {
                (0, chai_1.expect)(item.name).to.be.a("string").and.not.empty;
                (0, chai_1.expect)(item.compileArgs).to.be.an("array");
                (0, chai_1.expect)(item.pinDefines).to.be.an("object");
            }
        });
    });
});
//# sourceMappingURL=types.test.js.map