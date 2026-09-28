#!/usr/bin/env python3
"""Rung #5: the read-only Home-key watcher. The floor, and the verifier.

Reads the remote's key events and calls `launch` itself. Modifies no system
file, so it keeps working on any firmware the keyfilter patch does not.

Run it with `tools/homectl.sh watch`, which streams it over ssh. It is bounded
by --duration, it is in the foreground, and stopping it takes nothing with it.

    --discover     log key events from every input device, so the Home key is
                   learned rather than assumed
    (default)      watch the named device and launch on KEY_HOME keydown

Load-bearing details, each of which is a silent wrong answer if you get it
wrong:

  * `struct input_event` is 16 bytes here, never 24. Decoding with the wrong
    record size yields plausible fake keycodes rather than an error.
  * `luna-send` returns nothing unless its stdin is /dev/null.
  * Home is vendor code 773, above KEY_MAX, so uinput can neither advertise nor
    inject it, and EVIOCGRAB is not viable either: the compositor will not
    adopt a replacement input device. Reading is the only way to see the key.
  * The event node number drifts between boots. Resolve the device by name.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import select
import struct
import subprocess
import sys
import time

# `=llHHi` is 16 bytes on every host, matching the TV's native `@llHHi` in
# 32-bit userspace. The native form computes 24 where C `long` is 8 bytes.
EVENT_FORMAT = "=llHHi"
EVENT_SIZE = struct.calcsize(EVENT_FORMAT)
if EVENT_SIZE != 16:
    raise SystemExit(
        f"refusing to run: this Python builds a {EVENT_SIZE}-byte input_event, but "
        "the TV's is 16 bytes"
    )

EV_KEY = 0x01
KEY_DOWN, KEY_REPEAT = 1, 2
KEY_HOME = 773

# Enough to make the discovery log readable. Linux numbers are easy to swap and
# a mislabelled code is exactly how a fake keycode misleads you months later.
KEY_NAMES = {
    0x1C: "KEY_ENTER",
    0x67: "KEY_UP",
    0x69: "KEY_LEFT",
    0x6A: "KEY_RIGHT",
    0x6C: "KEY_DOWN",
    0x72: "KEY_VOLUMEDOWN",
    0x73: "KEY_VOLUMEUP",
    0x74: "KEY_POWER",
    0x8B: "KEY_MENU",
    0x9E: "KEY_BACK",
    0xAE: "KEY_EXIT",
    773: "KEY_HOME",
    1198: "VENDOR_1198",
    1199: "VENDOR_1199",
}

LUNA_LAUNCH = "luna://com.webos.applicationManager/launch"
LUNA_FOREGROUND = "luna://com.webos.applicationManager/getForegroundAppInfo"
STOCK_HOME = "com.webos.app.home"


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {time.monotonic():.3f}  {message}", flush=True)


def key_name(code: int) -> str:
    return KEY_NAMES.get(code, f"code {code}")


def luna(uri: str, params: dict, timeout: float = 5.0) -> dict | None:
    try:
        result = subprocess.run(
            ["luna-send", "-n", "1", "-f", uri, json.dumps(params)],
            stdin=subprocess.DEVNULL,  # without this luna-send returns nothing, silently
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (subprocess.TimeoutExpired, OSError):
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def foreground_app() -> str | None:
    payload = luna(LUNA_FOREGROUND, {})
    app_id = payload.get("appId") if isinstance(payload, dict) else None
    return app_id if isinstance(app_id, str) else None


def launch(app_id: str) -> bool:
    payload = luna(LUNA_LAUNCH, {"id": app_id, "params": {}})
    return bool(isinstance(payload, dict) and payload.get("returnValue"))


def input_devices() -> dict[str, str]:
    """device name -> /dev/input/eventN, for everything in /proc/bus/input/devices."""
    found: dict[str, str] = {}
    name = ""
    try:
        with open("/proc/bus/input/devices", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                if line.startswith("N: Name="):
                    name = line.split('"')[1] if '"' in line else ""
                elif line.startswith("H: Handlers=") and name:
                    for field in line.split():
                        if field.startswith("event") and field[5:].isdigit():
                            found[name] = f"/dev/input/{field}"
                            break
    except OSError as cause:
        log(f"cannot read /proc/bus/input/devices: {cause}")
    return found


def resolve_device(wanted: str) -> str | None:
    return input_devices().get(wanted)


def open_devices(paths: list[str]) -> dict[int, str]:
    devices: dict[int, str] = {}
    for path in paths:
        try:
            devices[os.open(path, os.O_RDONLY | os.O_NONBLOCK)] = path
        except OSError as cause:
            log(f"skip {path}: {cause}")
    return devices


def drain(fd: int, path: str, buffer: bytearray) -> list[tuple[int, int, int]]:
    records: list[tuple[int, int, int]] = []
    try:
        chunk = os.read(fd, EVENT_SIZE * 16)
    except BlockingIOError:
        return records
    except OSError as cause:
        log(f"{path}: read failed: {cause}")
        return records
    if not chunk:
        return records
    buffer += chunk
    while len(buffer) >= EVENT_SIZE:
        raw = bytes(buffer[:EVENT_SIZE])
        del buffer[:EVENT_SIZE]
        _, _, event_type, code, value = struct.unpack(EVENT_FORMAT, raw)
        records.append((event_type, code, value))
    return records


def discover(args: argparse.Namespace) -> int:
    paths = sorted(glob.glob(args.devices))
    if not paths:
        log(f"no devices match {args.devices}")
        return 1
    devices = open_devices(paths)
    if not devices:
        return 1

    log(f"discovering key events on {len(devices)} device(s), bounded to {args.duration}s")
    log("press the keys you care about: Home, and a control like Volume Up")

    buffers = {fd: bytearray() for fd in devices}
    seen: dict[str, int] = {}
    reported: set[tuple[str, int]] = set()
    deadline = time.monotonic() + args.duration

    try:
        while time.monotonic() < deadline:
            readable, _, _ = select.select(list(devices), [], [], 0.5)
            for fd in readable:
                path = devices[fd]
                for event_type, code, value in drain(fd, path, buffers[fd]):
                    if event_type != EV_KEY:
                        continue
                    seen[path] = seen.get(path, 0) + 1
                    if value == KEY_REPEAT:
                        if (path, code) not in reported:
                            reported.add((path, code))
                            log(f"{path}  {key_name(code)} repeat")
                        continue
                    log(f"{path}  {key_name(code)} {'down' if value == KEY_DOWN else 'up'}")
    finally:
        for fd in devices:
            os.close(fd)

    log("--- summary ---")
    if seen:
        for path, count in sorted(seen.items()):
            log(f"{path}: {count} key event(s)")
    else:
        log("no key events seen on any device")
    return 0


def watch(args: argparse.Namespace) -> int:
    path = resolve_device(args.device_name)
    if path is None:
        log(f'no input device named "{args.device_name}"')
        for name, node in sorted(input_devices().items()):
            log(f"  {name} -> {node}")
        return 1
    try:
        fd = os.open(path, os.O_RDONLY)
    except OSError as cause:
        log(f"cannot open {path}: {cause}")
        return 1

    log(f'watching {path} ("{args.device_name}") for {key_name(args.code)} keydown, read-only')
    log(f"bounded to {args.duration}s; target {args.app_id}")

    triggers = successes = flashes = 0
    buffer = bytearray()
    deadline = time.monotonic() + args.duration
    saw_ours = False

    try:
        while time.monotonic() < deadline:
            readable, _, _ = select.select([fd], [], [], 0.5)
            if not readable:
                continue
            for event_type, code, value in drain(fd, path, buffer):
                if not (event_type == EV_KEY and code == args.code and value == KEY_DOWN):
                    continue

                triggers += 1
                pressed_at = time.monotonic()
                log(f"{key_name(args.code)} down (#{triggers}), launching {args.app_id}")

                if not launch(args.app_id):
                    log("  launch call failed")
                    continue

                # Only a launch we initiated is ever judged. A user deliberately
                # opening another app must never count against the rung.
                saw_ours = False
                while time.monotonic() - pressed_at < args.verify_timeout:
                    current = foreground_app()
                    if current == args.app_id:
                        elapsed = (time.monotonic() - pressed_at) * 1000
                        successes += 1
                        saw_ours = True
                        log(f"  ours in foreground after {elapsed:.0f} ms")
                        break
                    if current == STOCK_HOME:
                        flashes += 1
                        log(f"  STOCK HOME won the race after "
                            f"{(time.monotonic() - pressed_at) * 1000:.0f} ms (flash #{flashes})")
                    time.sleep(0.1)
                else:
                    log(f"  did not reach foreground within {args.verify_timeout}s")

                if saw_ours and flashes >= args.max_flashes and args.max_flashes > 0:
                    log(f"  {flashes} stock-home flashes: the keyfilter patch is NOT "
                        f"getting there. Rung 3 has failed; rung 5 is carrying it.")
                    log("  reporting only. homectl.sh disarm will drop the mount; the")
                    log("  watcher never changes system state itself.")
    finally:
        os.close(fd)

    log(f"done: {triggers} trigger(s), {successes} verified, {flashes} stock-home flash(es)")
    if flashes:
        log("VERDICT: the stock home is still winning some Home presses. If the keyfilter")
        log("         mount says it is in effect, it is a silent no-op and must be")
        log("         disarmed. Do not read the mount as proof.")
    else:
        log("VERDICT: no stock-home flashes seen in this window.")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--device-name", default="LGE M-RCU - Builtin [0]")
    parser.add_argument("--devices", default="/dev/input/event*")
    parser.add_argument("--discover", action="store_true")
    parser.add_argument("--code", type=int, default=KEY_HOME)
    parser.add_argument("--app-id", default=os.environ.get("BLADES_APP_ID", "ooo.lew.xne"))
    parser.add_argument("--duration", type=float, default=120.0)
    parser.add_argument("--verify-timeout", type=float, default=4.0)
    parser.add_argument("--max-flashes", type=int, default=3,
                        help="warn after this many stock-home flashes; 0 disables")
    args = parser.parse_args(argv)

    if os.geteuid() != 0:
        log("warning: not root, opening an input device will likely fail")

    try:
        return discover(args) if args.discover else watch(args)
    except KeyboardInterrupt:
        log("interrupted")
        return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
