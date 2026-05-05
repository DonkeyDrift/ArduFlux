from __future__ import annotations

import json
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from .config import (
    ConfigStore,
    DEFAULT_BOARD_CATALOG,
    ValidationError,
    is_port_busy,
    is_usb_port,
    list_serial_ports,
    recommend_serial_port,
)


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("嵌入式开发板配置管理")
        self.minsize(860, 620)

        self.base_dir = Path.cwd()
        self.store = ConfigStore(base_dir=self.base_dir)
        self.data = self.store.load()

        self.status_var = tk.StringVar(value="就绪")

        self._build_ui()
        self._load_to_ui()
        self._refresh_ports(auto_select=True)
        self._refresh_profiles()

    def _build_ui(self) -> None:
        root = ttk.Frame(self, padding=12)
        root.pack(fill=tk.BOTH, expand=True)

        top = ttk.Frame(root)
        top.pack(fill=tk.X)
        ttk.Button(top, text="校验全部", command=self._validate_all).pack(side=tk.LEFT)
        ttk.Button(top, text="保存全部", command=self._save_all).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(top, text="打开配置文件", command=self._open_config_file).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Label(top, textvariable=self.status_var).pack(side=tk.RIGHT)

        nb = ttk.Notebook(root)
        nb.pack(fill=tk.BOTH, expand=True, pady=(12, 0))

        self.tab_board = ttk.Frame(nb, padding=12)
        self.tab_port = ttk.Frame(nb, padding=12)
        self.tab_build = ttk.Frame(nb, padding=12)
        self.tab_monitor = ttk.Frame(nb, padding=12)
        self.tab_profiles = ttk.Frame(nb, padding=12)

        nb.add(self.tab_board, text="板子型号")
        nb.add(self.tab_port, text="串口")
        nb.add(self.tab_build, text="编译输出路径")
        nb.add(self.tab_monitor, text="串口监视器")
        nb.add(self.tab_profiles, text="Profiles")

        self._build_board_tab()
        self._build_port_tab()
        self._build_build_tab()
        self._build_monitor_tab()
        self._build_profiles_tab()

    def _build_board_tab(self) -> None:
        self.board_choice = tk.StringVar()
        self.board_name = tk.StringVar()
        self.board_fqbn = tk.StringVar()
        self.board_compile_args = tk.StringVar()

        items = [b.name for b in DEFAULT_BOARD_CATALOG]
        items.append("自定义")

        row = ttk.Frame(self.tab_board)
        row.pack(fill=tk.X)
        ttk.Label(row, text="预置板型：", width=12).pack(side=tk.LEFT)
        self.board_combo = ttk.Combobox(row, textvariable=self.board_choice, values=items, state="readonly")
        self.board_combo.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.board_combo.bind("<<ComboboxSelected>>", lambda _e: self._on_board_selected())

        grid = ttk.Frame(self.tab_board)
        grid.pack(fill=tk.X, pady=(12, 0))
        grid.columnconfigure(1, weight=1)

        ttk.Label(grid, text="显示名称：").grid(row=0, column=0, sticky="w")
        ttk.Entry(grid, textvariable=self.board_name).grid(row=0, column=1, sticky="ew")
        ttk.Button(grid, text="保存", command=self._save_board).grid(row=0, column=2, padx=(8, 0))

        ttk.Label(grid, text="FQBN：").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(grid, textvariable=self.board_fqbn).grid(row=1, column=1, sticky="ew", pady=(8, 0))
        ttk.Button(grid, text="校验", command=self._validate_board).grid(row=1, column=2, padx=(8, 0), pady=(8, 0))

        ttk.Label(grid, text="编译参数：").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(grid, textvariable=self.board_compile_args).grid(row=2, column=1, sticky="ew", pady=(8, 0))

        ttk.Label(self.tab_board, text="引脚定义（JSON）：").pack(anchor="w", pady=(12, 0))
        self.pin_text = tk.Text(self.tab_board, height=12)
        self.pin_text.pack(fill=tk.BOTH, expand=True)

    def _build_port_tab(self) -> None:
        self.port_address = tk.StringVar()
        self.port_auto = tk.BooleanVar(value=True)
        self.port_busy_var = tk.StringVar(value="")
        self.last_successful_port_var = tk.StringVar(value="上次成功端口：无")
        self.recommended_port_var = tk.StringVar(value="当前推荐端口：无")

        row = ttk.Frame(self.tab_port)
        row.pack(fill=tk.X)
        ttk.Label(row, text="端口：", width=10).pack(side=tk.LEFT)
        self.port_combo = ttk.Combobox(row, textvariable=self.port_address, values=[], state="readonly")
        self.port_combo.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.port_combo.bind("<<ComboboxSelected>>", lambda _e: self._update_port_busy())
        ttk.Button(row, text="刷新", command=lambda: self._refresh_ports(auto_select=False)).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(row, text="保存", command=self._save_port).pack(side=tk.LEFT, padx=(8, 0))

        opts = ttk.Frame(self.tab_port)
        opts.pack(fill=tk.X, pady=(12, 0))
        ttk.Checkbutton(opts, text="自动选择（优先 USB）", variable=self.port_auto).pack(side=tk.LEFT)
        ttk.Label(opts, textvariable=self.port_busy_var).pack(side=tk.LEFT, padx=(12, 0))

        info = ttk.Frame(self.tab_port)
        info.pack(fill=tk.X, pady=(12, 0))
        ttk.Label(info, textvariable=self.last_successful_port_var).pack(anchor="w")
        ttk.Label(info, textvariable=self.recommended_port_var).pack(anchor="w")

        ttk.Label(
            self.tab_port,
            text="提示：若提示“串口被占用”，请关闭串口监视器/串口助手后重试。",
        ).pack(anchor="w", pady=(12, 0))

    def _build_build_tab(self) -> None:
        self.output_dir = tk.StringVar()
        self.recent_choice = tk.StringVar()

        row = ttk.Frame(self.tab_build)
        row.pack(fill=tk.X)
        ttk.Label(row, text="输出目录：", width=12).pack(side=tk.LEFT)
        ttk.Entry(row, textvariable=self.output_dir).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(row, text="选择...", command=self._browse_output_dir).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(row, text="保存", command=self._save_build).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(row, text="校验", command=self._validate_build).pack(side=tk.LEFT, padx=(8, 0))

        row2 = ttk.Frame(self.tab_build)
        row2.pack(fill=tk.X, pady=(12, 0))
        ttk.Label(row2, text="最近路径：", width=12).pack(side=tk.LEFT)
        self.recent_combo = ttk.Combobox(row2, textvariable=self.recent_choice, values=[], state="readonly")
        self.recent_combo.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.recent_combo.bind("<<ComboboxSelected>>", lambda _e: self._apply_recent_output_dir())

        self.output_hint = tk.StringVar(value="")
        ttk.Label(self.tab_build, textvariable=self.output_hint).pack(anchor="w", pady=(12, 0))

    def _build_monitor_tab(self) -> None:
        self.monitor_enabled = tk.BooleanVar(value=True)
        self.monitor_baud = tk.StringVar()
        self.monitor_data_bits = tk.StringVar()
        self.monitor_stop_bits = tk.StringVar()
        self.monitor_parity = tk.StringVar()
        self.monitor_newline = tk.StringVar()

        row = ttk.Frame(self.tab_monitor)
        row.pack(fill=tk.X)
        ttk.Checkbutton(row, text="上传完成后自动打开串口监视器", variable=self.monitor_enabled).pack(side=tk.LEFT)
        ttk.Button(row, text="保存", command=self._save_monitor).pack(side=tk.RIGHT)
        ttk.Button(row, text="校验", command=self._validate_monitor).pack(side=tk.RIGHT, padx=(8, 0))

        grid = ttk.Frame(self.tab_monitor)
        grid.pack(fill=tk.X, pady=(12, 0))
        for i in range(4):
            grid.columnconfigure(i, weight=1)

        ttk.Label(grid, text="波特率").grid(row=0, column=0, sticky="w")
        ttk.Entry(grid, textvariable=self.monitor_baud).grid(row=1, column=0, sticky="ew", padx=(0, 8))

        ttk.Label(grid, text="数据位").grid(row=0, column=1, sticky="w")
        ttk.Entry(grid, textvariable=self.monitor_data_bits).grid(row=1, column=1, sticky="ew", padx=(0, 8))

        ttk.Label(grid, text="停止位").grid(row=0, column=2, sticky="w")
        ttk.Entry(grid, textvariable=self.monitor_stop_bits).grid(row=1, column=2, sticky="ew", padx=(0, 8))

        ttk.Label(grid, text="校验位").grid(row=0, column=3, sticky="w")
        ttk.Combobox(
            grid,
            textvariable=self.monitor_parity,
            values=["none", "odd", "even", "mark", "space"],
            state="readonly",
        ).grid(row=1, column=3, sticky="ew")

        row2 = ttk.Frame(self.tab_monitor)
        row2.pack(fill=tk.X, pady=(12, 0))
        ttk.Label(row2, text="换行符：", width=12).pack(side=tk.LEFT)
        ttk.Combobox(row2, textvariable=self.monitor_newline, values=["CRLF", "LF", "CR"], state="readonly").pack(
            side=tk.LEFT, fill=tk.X, expand=True
        )

        ttk.Label(
            self.tab_monitor,
            text="说明：arduino-cli monitor 必须依赖串口工具链支持；脚本会至少应用波特率设置。",
        ).pack(anchor="w", pady=(12, 0))

    def _build_profiles_tab(self) -> None:
        self.profile_name = tk.StringVar()
        self.profile_new_name = tk.StringVar()

        row = ttk.Frame(self.tab_profiles)
        row.pack(fill=tk.X)
        ttk.Label(row, text="Profile：", width=10).pack(side=tk.LEFT)
        self.profile_combo = ttk.Combobox(row, textvariable=self.profile_name, values=[], state="readonly")
        self.profile_combo.pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(row, text="应用", command=self._apply_profile).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(row, text="删除", command=self._delete_profile).pack(side=tk.LEFT, padx=(8, 0))

        row2 = ttk.Frame(self.tab_profiles)
        row2.pack(fill=tk.X, pady=(12, 0))
        ttk.Label(row2, text="另存为：", width=10).pack(side=tk.LEFT)
        ttk.Entry(row2, textvariable=self.profile_new_name).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(row2, text="保存当前为 Profile", command=self._save_profile).pack(side=tk.LEFT, padx=(8, 0))

        row3 = ttk.Frame(self.tab_profiles)
        row3.pack(fill=tk.X, pady=(12, 0))
        ttk.Button(row3, text="导出 Profiles(JSON)", command=self._export_profiles).pack(side=tk.LEFT)
        ttk.Button(row3, text="导入 Profiles(JSON)", command=self._import_profiles).pack(side=tk.LEFT, padx=(8, 0))

    def _load_to_ui(self) -> None:
        cur = self.store.get_current()

        board = cur.get("board") or {}
        self.board_name.set(str(board.get("name") or ""))
        self.board_fqbn.set(str(board.get("fqbn") or ""))
        self.board_compile_args.set(" ".join([str(x) for x in (board.get("compileArgs") or [])]))
        self.pin_text.delete("1.0", tk.END)
        self.pin_text.insert(tk.END, json.dumps(board.get("pinDefines") or {}, ensure_ascii=False, indent=2))

        catalog_names = [b.name for b in DEFAULT_BOARD_CATALOG]
        if self.board_name.get() in catalog_names:
            self.board_choice.set(self.board_name.get())
        else:
            self.board_choice.set("自定义")

        port = cur.get("port") or {}
        self.port_address.set(str(port.get("address") or ""))
        self.port_auto.set(bool(port.get("auto")))
        last_successful = str(port.get("lastSuccessfulAddress") or "").strip()
        if last_successful:
            self.last_successful_port_var.set(f"上次成功端口：{last_successful}")
        else:
            self.last_successful_port_var.set("上次成功端口：无")

        build = cur.get("build") or {}
        self.output_dir.set(str(build.get("outputDir") or ""))
        self._refresh_recent_output_dirs()

        monitor = cur.get("monitor") or {}
        self.monitor_enabled.set(bool(monitor.get("enabled")))
        self.monitor_baud.set(str(monitor.get("baudRate") or "115200"))
        self.monitor_data_bits.set(str(monitor.get("dataBits") or "8"))
        self.monitor_stop_bits.set(str(monitor.get("stopBits") or "1"))
        self.monitor_parity.set(str(monitor.get("parity") or "none"))
        self.monitor_newline.set(str(monitor.get("newline") or "CRLF"))

    def _on_board_selected(self) -> None:
        choice = self.board_choice.get()
        if choice == "自定义":
            self._set_status("已切换为自定义板型")
            return
        item = next((b for b in DEFAULT_BOARD_CATALOG if b.name == choice), None)
        if not item:
            return
        self.board_name.set(item.name)
        self.board_fqbn.set(item.fqbn)
        self.board_compile_args.set(" ".join(item.compile_args))
        self.pin_text.delete("1.0", tk.END)
        self.pin_text.insert(tk.END, json.dumps(item.pin_defines, ensure_ascii=False, indent=2))
        self._set_status("已载入预置板型")

    def _save_board(self) -> None:
        try:
            pin_defines = json.loads(self.pin_text.get("1.0", tk.END).strip() or "{}")
            compile_args = [x for x in self.board_compile_args.get().split(" ") if x.strip()]
            self.store.set_board(
                name=self.board_name.get().strip() or "Custom",
                fqbn=self.board_fqbn.get().strip(),
                compile_args=compile_args,
                pin_defines=pin_defines if isinstance(pin_defines, dict) else {},
            )
            self.store.save()
            self._set_status("板子配置已保存")
        except json.JSONDecodeError:
            messagebox.showerror("引脚定义错误", "引脚定义必须是合法 JSON")
        except ValidationError as e:
            messagebox.showerror("板子配置无效", self._format_error(e))

    def _validate_board(self) -> None:
        try:
            self.store.validate_board(
                {"fqbn": self.board_fqbn.get().strip()},
            )
            self._set_status("板子配置校验通过")
        except ValidationError as e:
            messagebox.showerror("板子配置无效", self._format_error(e))

    def _refresh_ports(self, *, auto_select: bool) -> None:
        ports = list_serial_ports(arduino_cli=self.store.arduino_cli, runner=self.store.runner)
        values = []
        for p in ports:
            addr = p["address"]
            if is_usb_port(p):
                values.append(f"{addr} [USB]")
            else:
                values.append(addr)
        self.port_combo["values"] = values

        current_port = self.store.get_current().get("port") or {}
        saved_port = str(current_port.get("address") or "").strip()
        recommended = recommend_serial_port(ports, saved_port=saved_port, auto_select=bool(self.port_auto.get()))
        if recommended:
            self.recommended_port_var.set(f"当前推荐端口：{recommended}")
        else:
            self.recommended_port_var.set("当前推荐端口：无")

        if auto_select and self.port_auto.get() and recommended:
            self.port_address.set(recommended)
        elif not self.port_address.get().strip() and saved_port:
            self.port_address.set(saved_port)
        elif not self.port_address.get().strip() and ports:
            self.port_address.set(str(ports[0]["address"]))

        self._update_port_busy()
        self._set_status("串口列表已刷新")

    def _update_port_busy(self) -> None:
        addr = self.port_address.get().replace("[USB]", "").strip()
        if not addr:
            self.port_busy_var.set("")
            return
        self.port_busy_var.set("占用中" if is_port_busy(addr) else "可用")

    def _save_port(self) -> None:
        try:
            address = self.port_address.get().replace("[USB]", "").strip()
            self.store.set_port(address=address, auto=self.port_auto.get())
            self.store.save()
            self._set_status("串口配置已保存")
        except ValidationError as e:
            messagebox.showerror("串口配置无效", self._format_error(e))

    def _browse_output_dir(self) -> None:
        chosen = filedialog.askdirectory(initialdir=str(self.base_dir))
        if chosen:
            self.output_dir.set(chosen)
            self._set_status("已选择输出目录")

    def _apply_recent_output_dir(self) -> None:
        val = self.recent_choice.get()
        if val:
            self.output_dir.set(val)
            self._set_status("已应用最近路径")

    def _refresh_recent_output_dirs(self) -> None:
        build = (self.store.get_current().get("build") or {})
        recent = [str(x) for x in (build.get("recentOutputDirs") or [])]
        self.recent_combo["values"] = recent
        if recent:
            self.recent_choice.set(recent[-1])

    def _save_build(self) -> None:
        try:
            p = self.store.set_output_dir(output_dir=self.output_dir.get().strip())
            self.store.save()
            self._refresh_recent_output_dirs()
            self.output_hint.set(f"已保存：{p}")
            self._set_status("输出路径已保存")
        except ValidationError as e:
            messagebox.showerror("输出路径无效", self._format_error(e))

    def _validate_build(self) -> None:
        try:
            self.store.validate_build({"outputDir": self.output_dir.get().strip()})
            self._set_status("输出路径校验通过")
        except ValidationError as e:
            messagebox.showerror("输出路径无效", self._format_error(e))

    def _save_monitor(self) -> None:
        try:
            self.store.set_monitor(
                enabled=bool(self.monitor_enabled.get()),
                baudRate=int(self.monitor_baud.get().strip() or "0"),
                dataBits=int(self.monitor_data_bits.get().strip() or "0"),
                stopBits=float(self.monitor_stop_bits.get().strip() or "0"),
                parity=self.monitor_parity.get().strip(),
                newline=self.monitor_newline.get().strip(),
            )
            self.store.save()
            self._set_status("监视器配置已保存")
        except ValidationError as e:
            messagebox.showerror("监视器配置无效", self._format_error(e))
        except ValueError:
            messagebox.showerror("监视器配置无效", "请检查波特率/数据位/停止位输入是否为数字")

    def _validate_monitor(self) -> None:
        try:
            self.store.validate_monitor(
                {
                    "enabled": bool(self.monitor_enabled.get()),
                    "baudRate": int(self.monitor_baud.get().strip() or "0"),
                    "dataBits": int(self.monitor_data_bits.get().strip() or "0"),
                    "stopBits": float(self.monitor_stop_bits.get().strip() or "0"),
                    "parity": self.monitor_parity.get().strip(),
                    "newline": self.monitor_newline.get().strip(),
                }
            )
            self._set_status("监视器配置校验通过")
        except ValidationError as e:
            messagebox.showerror("监视器配置无效", self._format_error(e))
        except ValueError:
            messagebox.showerror("监视器配置无效", "请检查波特率/数据位/停止位输入是否为数字")

    def _refresh_profiles(self) -> None:
        profiles = self.data.get("profiles") or {}
        names = sorted([str(k) for k in profiles.keys()])
        self.profile_combo["values"] = names
        if names and not self.profile_name.get():
            self.profile_name.set(names[0])

    def _save_profile(self) -> None:
        try:
            self._sync_ui_to_store()
            name = self.profile_new_name.get().strip()
            self.store.save_profile(name)
            self.store.save()
            self.data = self.store.load()
            self._refresh_profiles()
            self.profile_name.set(name)
            self._set_status("Profile 已保存")
        except ValidationError as e:
            messagebox.showerror("保存 Profile 失败", self._format_error(e))

    def _apply_profile(self) -> None:
        try:
            name = self.profile_name.get().strip()
            self.store.apply_profile(name)
            self.store.save()
            self.data = self.store.load()
            self._load_to_ui()
            self._set_status("Profile 已应用")
        except ValidationError as e:
            messagebox.showerror("应用 Profile 失败", self._format_error(e))

    def _delete_profile(self) -> None:
        name = self.profile_name.get().strip()
        if not name:
            return
        if not messagebox.askyesno("确认删除", f"确定删除 Profile：{name} ？"):
            return
        self.store.delete_profile(name)
        self.store.save()
        self.data = self.store.load()
        self._refresh_profiles()
        self._set_status("Profile 已删除")

    def _export_profiles(self) -> None:
        path = filedialog.asksaveasfilename(
            title="导出 Profiles",
            defaultextension=".json",
            filetypes=[("JSON", "*.json")],
            initialdir=str(self.base_dir),
        )
        if not path:
            return
        try:
            p = self.store.export_profiles(path)
            self._set_status(f"已导出：{p}")
        except ValidationError as e:
            messagebox.showerror("导出失败", self._format_error(e))

    def _import_profiles(self) -> None:
        path = filedialog.askopenfilename(
            title="导入 Profiles",
            filetypes=[("JSON", "*.json")],
            initialdir=str(self.base_dir),
        )
        if not path:
            return
        try:
            self.store.import_profiles(path, merge=True)
            self.store.save()
            self.data = self.store.load()
            self._refresh_profiles()
            self._set_status("Profiles 已导入")
        except ValidationError as e:
            messagebox.showerror("导入失败", self._format_error(e))

    def _sync_ui_to_store(self) -> None:
        pin_defines = json.loads(self.pin_text.get("1.0", tk.END).strip() or "{}")
        compile_args = [x for x in self.board_compile_args.get().split(" ") if x.strip()]
        self.store.set_board(
            name=self.board_name.get().strip() or "Custom",
            fqbn=self.board_fqbn.get().strip(),
            compile_args=compile_args,
            pin_defines=pin_defines if isinstance(pin_defines, dict) else {},
        )
        if self.port_address.get().strip():
            self.store.set_port(address=self.port_address.get().replace("[USB]", "").strip(), auto=self.port_auto.get())
        if self.output_dir.get().strip():
            self.store.set_output_dir(output_dir=self.output_dir.get().strip())
        self.store.set_monitor(
            enabled=bool(self.monitor_enabled.get()),
            baudRate=int(self.monitor_baud.get().strip() or "0"),
            dataBits=int(self.monitor_data_bits.get().strip() or "0"),
            stopBits=float(self.monitor_stop_bits.get().strip() or "0"),
            parity=self.monitor_parity.get().strip(),
            newline=self.monitor_newline.get().strip(),
        )

    def _validate_all(self) -> None:
        try:
            self._sync_ui_to_store()
            self.store.validate_all()
            self._set_status("全部校验通过")
        except ValidationError as e:
            messagebox.showerror("校验失败", self._format_error(e))
        except json.JSONDecodeError:
            messagebox.showerror("校验失败", "引脚定义必须是合法 JSON")
        except ValueError:
            messagebox.showerror("校验失败", "请检查数字字段输入（波特率/数据位/停止位）")

    def _save_all(self) -> None:
        try:
            self._sync_ui_to_store()
            self.store.save()
            self.data = self.store.load()
            self._refresh_recent_output_dirs()
            self._refresh_profiles()
            self._set_status("全部配置已保存")
        except ValidationError as e:
            messagebox.showerror("保存失败", self._format_error(e))
        except json.JSONDecodeError:
            messagebox.showerror("保存失败", "引脚定义必须是合法 JSON")
        except ValueError:
            messagebox.showerror("保存失败", "请检查数字字段输入（波特率/数据位/停止位）")

    def _open_config_file(self) -> None:
        try:
            self.store.save()
        except Exception:
            pass
        messagebox.showinfo("配置文件路径", str(self.store.config_path))

    @staticmethod
    def _format_error(e: ValidationError) -> str:
        if e.suggestion:
            return f"{e.message}\n\n建议：{e.suggestion}"
        return e.message

    def _set_status(self, text: str) -> None:
        self.status_var.set(text)


def main() -> None:
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
