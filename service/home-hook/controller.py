#!/usr/bin/env python3
"""Owns the Home hook: loads it into LG's input processes, keeps its lease alive,
and opens the app on a Home press. Runs as root. Any fault drops the lease, which
returns Home to the stock path."""
import errno
import hashlib
import json
import os
import re
import select
import shutil
import socket
import stat
import struct
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PREBUILT = os.path.join(HERE, "native", "prebuilt")
RUNTIME = "/tmp/lg-xmb-home-button"
INSTALL = "/var/lib/nxe/home-hook"
PIDFILE = "/tmp/nxe-homehook.pid"
APP_ID = os.environ.get("NXE_APP_ID", "ooo.lew.nxe")
TARGETS = ("lginput2", "micomservice", "RELEASE", "tvservice")
LIBRARY = "lgxmb-home-hook.so"
ARTIFACTS = ("ezinject", LIBRARY)
HOME_KEYS = (125, 773, 774)
SCM_CREDENTIALS = 2
LAUNCH_GAP = 1.0


class HookError(Exception):
    pass


def require(condition, code="hook_failed"):
    if not condition:
        raise HookError(code)


def clock():
    return time.clock_gettime(time.CLOCK_BOOTTIME)


def parse_message(data):
    """A datagram as ('READY', pid, birth, ms) or ('HOME', pid, birth, code, ms), or None."""
    try:
        parts = data.decode("ascii").split()
        if len(parts) < 2 or parts[:2] != ["LGXMB_HOME", "1"]:
            return None
        if len(parts) == 8 and parts[2] == "READY" and parts[6] in ("lginput", "micom", "write"):
            return ("READY", parts[3], int(parts[4]), int(parts[5]), int(parts[7]))
        if len(parts) == 9 and parts[2] == "HOME" and parts[7] == "1":
            return ("HOME", parts[3], int(parts[4]), int(parts[5]), int(parts[6]), int(parts[8]))
    except (UnicodeError, ValueError):
        return None
    return None


def lease_text(build, now_seconds):
    return "LGXMB_HOME 1 %s %d\n" % (build, int(now_seconds * 1000))


def process(pid):
    """(pid, birth, name) of a root-owned LG input process, else None."""
    base = "/proc/%d" % pid
    try:
        if os.stat(base).st_uid != 0:
            return None
        with open(base + "/comm", "rb") as stream:
            name = stream.read(64).decode("ascii").strip()
        if name not in TARGETS:
            return None
        with open(base + "/stat", "rb") as stream:
            fields = stream.read(4096).rsplit(b")", 1)[1].split()
        if fields[0] in (b"Z", b"X"):
            return None
        return (pid, int(fields[19]), name)
    except (OSError, ValueError, IndexError, UnicodeError):
        return None


def targets():
    found = {}
    for entry in os.listdir("/proc"):
        if entry.isdigit():
            identity = process(int(entry))
            if identity is not None:
                found[identity[0]] = identity
    return found


def runtime_directory():
    os.makedirs(RUNTIME, mode=0o700, exist_ok=True)
    info = os.lstat(RUNTIME)
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0, "runtime_unsafe")
    os.chmod(RUNTIME, 0o700)


def remove_owned(name):
    path = os.path.join(RUNTIME, name)
    try:
        info = os.lstat(path)
    except OSError as error:
        if error.errno == errno.ENOENT:
            return
        raise
    require(info.st_uid == 0 and not info.st_mode & 0o077, "runtime_unsafe")
    os.unlink(path)


def install():
    """Copy the verified artifacts out of the app tree and return (build, directory)."""
    with open(os.path.join(PREBUILT, "build.json"), "rb") as stream:
        meta = json.loads(stream.read().decode("ascii"))
    build = meta["buildId"]
    require(meta["schema"] == 1 and meta["protocol"] == 1 and re.match(r"\A[0-9a-f]{64}\Z", build))
    require(meta["architecture"] == "arm-linux-gnueabi", "hook_unsupported")
    target = os.path.join(INSTALL, build)
    os.makedirs(target, mode=0o755, exist_ok=True)
    for name in ARTIFACTS:
        with open(os.path.join(PREBUILT, name), "rb") as stream:
            blob = stream.read()
        require(hashlib.sha256(blob).hexdigest() == meta["files"][name], "hook_missing")
        require(blob[:6] == b"\x7fELF\x01\x01" and blob[18:20] == b"\x28\x00", "hook_unsupported")
        destination = os.path.join(target, name)
        if not os.path.exists(destination):
            shutil.copyfile(os.path.join(PREBUILT, name), destination)
        os.chmod(destination, 0o755 if name == "ezinject" else 0o644)
    return build, target


def inspect(identity, library):
    """True when our hook is already mapped, False when clear. Raises on an unsupported or conflicting process."""
    pid = identity[0]
    with open("/proc/%d/exe" % pid, "rb") as stream:
        header = stream.read(20)
    require(header[:6] == b"\x7fELF\x01\x01" and header[18:20] == b"\x28\x00", "hook_unsupported")
    with open("/proc/%d/maps" % pid, "rb") as stream:
        raw = stream.read(2 * 1024 * 1024)
    mapped = False
    for line in raw.decode("utf-8", "replace").splitlines():
        path = line.split(None, 5)[-1]
        if LIBRARY in path:
            require(path == library, "hook_reboot_required")
            mapped = True
        elif any(token in path.lower() for token in ("inputhook", "lginput-hook")):
            raise HookError("hook_conflict")
    return mapped


def launch():
    subprocess.Popen(
        ["luna-send", "-n", "1", "-f", "luna://com.webos.applicationManager/launch",
         json.dumps({"id": APP_ID, "params": {"home": True}})],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class Controller:
    def __init__(self):
        self.build, self.path = install()
        runtime_directory()
        remove_owned("lease")
        remove_owned("control.sock")
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_PASSCRED, 1)
        self.sock.setblocking(False)
        sock_path = os.path.join(RUNTIME, "control.sock")
        self.sock.bind(sock_path)
        os.chmod(sock_path, 0o600)
        self.identities, self.attempted, self.ready, self.children = {}, {}, {}, {}
        self.next_scan = self.next_lease = self.last_launch = 0.0

    def scan(self, now):
        current = targets()
        self.identities = current
        self.ready = {i: v for i, v in self.ready.items() if current.get(i[0]) == i}
        for identity in list(current.values()):
            if identity in self.attempted:
                continue
            self.attempted[identity] = now + 5
            try:
                mapped = inspect(identity, os.path.join(self.path, LIBRARY))
            except OSError as error:
                if error.errno in (errno.ENOENT, errno.ESRCH):
                    del current[identity[0]]
                    continue
                raise
            if mapped:
                continue
            log = os.path.join(RUNTIME, "inject-%d.log" % identity[0])
            with open(log, "wb"):
                pass
            child = subprocess.Popen(
                [os.path.join(self.path, "ezinject"), "-l", log, str(identity[0]),
                 os.path.join(self.path, LIBRARY)],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                close_fds=True)
            self.children[identity] = (child, now + 5)

    def messages(self, now):
        for _ in range(64):
            try:
                data, ancillary, flags, _ = self.sock.recvmsg(256, socket.CMSG_SPACE(12))
            except (BlockingIOError, InterruptedError):
                return
            credentials = [struct.unpack("3i", value) for level, kind, value in ancillary
                           if level == socket.SOL_SOCKET and kind == SCM_CREDENTIALS and len(value) == 12]
            if flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC) or len(credentials) != 1:
                continue
            message = parse_message(data)
            if message is None or message[1] != self.build or credentials[0][1] != 0:
                continue
            pid, birth = message[2], message[3]
            identity = self.identities.get(pid)
            if identity is None or identity[1] != birth or credentials[0][0] != pid:
                continue
            if message[0] == "READY":
                stamp = message[4] / 1000.0
                if 0 <= clock() - stamp <= 1.5:
                    self.ready[identity] = stamp
            elif message[4] in HOME_KEYS and self.ok(now):
                if 0 <= clock() * 1000 - message[5] <= 250 and now - self.last_launch > LAUNCH_GAP:
                    self.last_launch = now
                    launch()

    def ok(self, now):
        return bool(self.identities) and all(
            i in self.ready and 0 <= now - self.ready[i] < 2 for i in self.identities.values())

    def write_lease(self, now):
        tmp = os.path.join(RUNTIME, "lease.tmp")
        with open(tmp, "w") as stream:
            stream.write(lease_text(self.build, now))
        os.chmod(tmp, 0o600)
        os.replace(tmp, os.path.join(RUNTIME, "lease"))

    def step(self):
        if select.select([self.sock], [], [], 0.25)[0]:
            self.messages(clock())
        now = clock()
        for identity, (child, deadline) in list(self.children.items()):
            code = child.poll()
            if code is None and now >= deadline:
                child.kill()
                child.wait()
                raise HookError("hook_start_failed")
            if code is not None:
                del self.children[identity]
                require(code == 0 or process(identity[0]) != identity, "hook_start_failed")
        if now >= self.next_scan:
            self.scan(now)
            self.next_scan = now + 2
        require(not any(i not in self.ready and now >= self.attempted[i]
                        for i in self.identities.values()), "hook_reboot_required")
        if not self.ok(now):
            remove_owned("lease")
        elif now >= self.next_lease:
            self.write_lease(now)
            self.next_lease = now + 0.5

    def close(self):
        try:
            remove_owned("lease")
        finally:
            for child, _ in self.children.values():
                if child.poll() is None:
                    child.kill()
                child.wait()
            self.sock.close()
            remove_owned("control.sock")


def run():
    with open(PIDFILE, "w") as stream:
        stream.write(str(os.getpid()))
    controller = Controller()
    try:
        while True:
            controller.step()
    finally:
        controller.close()
        try:
            os.unlink(PIDFILE)
        except OSError:
            pass


if __name__ == "__main__":
    if os.geteuid() != 0:
        sys.exit("controller.py must run as root")
    try:
        run()
    except HookError as error:
        sys.exit(str(error))
