# Home hook

Takes the Home key without restarting any service. A small native library
is injected into LG's input processes; it reports Home presses to
`controller.py`, which opens this app.

`native/` is LG-XMB's Home hook and injector with its source, build script and prebuilt binaries. It is GPL-3.0-only; see `native/NOTICE.md` for its sources and the licenses of what it links. Used with the author's agreement (2026-10-02). Remove this directory and `controller.py` to drop it.

`controller.py` is ours, written to the wire protocol in LG-XMB's
`tv-helper/native/README.md`: READY and HOME datagrams on
`/tmp/lg-xmb-home-button/control.sock`, and a lease file refreshed every 500ms.
Without a fresh lease the hook leaves Home on the stock path.

```
sh start.sh      start the controller detached (idempotent)
sh stop.sh       stop it and remove the lease; Home is stock at once
sh autostart.sh  start it at boot (link into init.d as 62-nxe-homehook)
```

With [LG Input Hook](https://repo.webosbrew.org/apps/org.webosbrew.inputhook/)
installed, two hooks on the same LG functions are not safe, so nothing is
injected. `controller.py` instead adds an Execute binding for each Home key
(125, 773, 774) to `/home/root/.config/lginputhook/keybinds.json` that opens this
app, re-checks it every two seconds, never replaces a binding you made yourself,
and removes its own on `stop.sh`. Launch Input Hook once after boot so it is
injected before this starts.

The library stays mapped in LG's processes until they exit. With the lease gone
it does nothing.
