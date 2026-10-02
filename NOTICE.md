# Notices

NXE is MIT licensed (see `LICENSE`), except where a directory says otherwise.

## Home button hook

`service/home-hook/native/` is GPL-3.0-only. Its source, build script, licences
and the licences of everything linked into the prebuilt binaries are in that
directory (`LICENSE-GPL-3.0`, `NOTICE.md`, `licenses/`).

## Fonts

Inter (`app/src/assets/fonts/inter-*.ttf`) is licensed under the SIL Open Font
License 1.1. The licence text is `app/src/assets/fonts/OFL.txt`.

## Bundled dependencies

The build bundles three.js, Vue, Pinia, qrcode-generator and steam-session with
its dependencies, all under permissive licences (MIT, BSD, Apache-2.0, ISC).
Their licence headers are kept in the bundle. `node-bignumber`, pulled in by
steam-session, declares no licence field; its package ships a `LICENSE` file by
Tom Wu (BSD-style).

## Trademarks

NXE is an independent project and is not affiliated with or endorsed by
Microsoft, LG Electronics or Valve. Xbox is a trademark of Microsoft. webOS and
LG are trademarks of LG Electronics. Steam is a trademark of Valve. They are
used only to describe what this project recreates or connects to. No Microsoft,
LG or Valve assets are included in this repository.
