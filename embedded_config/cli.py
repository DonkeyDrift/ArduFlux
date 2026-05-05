from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import ConfigStore, ValidationError, list_serial_ports


def _print_json(obj: object) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def cmd_show(store: ConfigStore, _args: argparse.Namespace) -> int:
    store.load()
    _print_json(store._data)
    return 0


def cmd_validate(store: ConfigStore, _args: argparse.Namespace) -> int:
    store.load()
    try:
        store.validate_all()
    except ValidationError as e:
        print(f"校验失败：{e.message}")
        if e.suggestion:
            print(f"建议：{e.suggestion}")
        return 2
    print("校验通过")
    return 0


def cmd_ports(store: ConfigStore, args: argparse.Namespace) -> int:
    ports = list_serial_ports(arduino_cli=store.arduino_cli, runner=store.runner)
    if args.json:
        _print_json(ports)
    else:
        for p in ports:
            print(f"{p.get('address','')}\t{p.get('label','')}")
    return 0


def cmd_profile_save(store: ConfigStore, args: argparse.Namespace) -> int:
    store.load()
    try:
        store.save_profile(args.name)
        store.save()
    except ValidationError as e:
        print(f"保存失败：{e.message}")
        if e.suggestion:
            print(f"建议：{e.suggestion}")
        return 2
    print("已保存")
    return 0


def cmd_profile_apply(store: ConfigStore, args: argparse.Namespace) -> int:
    store.load()
    try:
        store.apply_profile(args.name)
        store.save()
    except ValidationError as e:
        print(f"应用失败：{e.message}")
        if e.suggestion:
            print(f"建议：{e.suggestion}")
        return 2
    print("已应用")
    return 0


def cmd_profile_export(store: ConfigStore, args: argparse.Namespace) -> int:
    store.load()
    try:
        p = store.export_profiles(args.path)
    except ValidationError as e:
        print(f"导出失败：{e.message}")
        if e.suggestion:
            print(f"建议：{e.suggestion}")
        return 2
    print(str(p))
    return 0


def cmd_profile_import(store: ConfigStore, args: argparse.Namespace) -> int:
    store.load()
    try:
        store.import_profiles(args.path, merge=not args.replace)
        store.save()
    except ValidationError as e:
        print(f"导入失败：{e.message}")
        if e.suggestion:
            print(f"建议：{e.suggestion}")
        return 2
    print("已导入")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="embedded-config", description="嵌入式开发板配置管理（JSON/Profiles/校验）")
    p.add_argument("--base-dir", default=".", help="项目目录（默认当前目录）")
    sub = p.add_subparsers(dest="cmd", required=True)

    s_show = sub.add_parser("show", help="打印当前配置")
    s_show.set_defaults(func=cmd_show)

    s_val = sub.add_parser("validate", help="校验当前配置")
    s_val.set_defaults(func=cmd_validate)

    s_ports = sub.add_parser("ports", help="列出串口")
    s_ports.add_argument("--json", action="store_true", help="JSON 输出")
    s_ports.set_defaults(func=cmd_ports)

    prof = sub.add_parser("profile", help="Profile 操作")
    prof_sub = prof.add_subparsers(dest="subcmd", required=True)

    ps = prof_sub.add_parser("save", help="将 current 保存为 Profile")
    ps.add_argument("name", help="Profile 名称")
    ps.set_defaults(func=cmd_profile_save)

    pa = prof_sub.add_parser("apply", help="将 Profile 应用到 current")
    pa.add_argument("name", help="Profile 名称")
    pa.set_defaults(func=cmd_profile_apply)

    pe = prof_sub.add_parser("export", help="导出 Profiles 为 JSON")
    pe.add_argument("path", help="导出路径")
    pe.set_defaults(func=cmd_profile_export)

    pi = prof_sub.add_parser("import", help="从 JSON 导入 Profiles")
    pi.add_argument("path", help="导入路径")
    pi.add_argument("--replace", action="store_true", help="覆盖本地 profiles（不合并）")
    pi.set_defaults(func=cmd_profile_import)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    store = ConfigStore(base_dir=Path(args.base_dir))
    return int(args.func(store, args))


if __name__ == "__main__":
    raise SystemExit(main())
