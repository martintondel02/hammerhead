# Hammerhead

A native desktop client for [Sharkord](https://github.com/Sharkord/sharkord) —
the lightweight, self-hosted chat platform with voice, video, and screen
sharing.

Hammerhead is a thin native shell (Tauri 2 + WebKitGTK) that lets you keep
your Sharkord servers one click away, outside the browser tab graveyard:

- **Server picker** — save as many Sharkord servers as you like, connect with
  one click, switch with `Ctrl+Shift+H`
- **Native window** — proper app icon, taskbar entry, window state remembered
  across restarts, single-instance
- **Small footprint** — a ~2.5 MB flatpak bundle instead of a bundled
  Chromium; it uses your system WebKitGTK

The web client ships *with the Sharkord server itself*, so Hammerhead always
runs the version your server expects — no client/server version skew.

## Install

### Flatpak (recommended, Fedora Workstation 44)

From a release:

```sh
flatpak install Hammerhead-0.1.0.x86_64.flatpak
flatpak run io.github.martintondel02.hammerhead
```

Build it yourself:

```sh
git clone https://github.com/martintondel02/hammerhead
cd hammerhead
flatpak-builder --user --install --force-clean \
  build-dir build-aux/io.github.martintondel02.hammerhead.json
```

Requirements: `flatpak`, `flatpak-builder`, and the GNOME 49 runtime/SDK
(`flatpak install flathub org.gnome.Platform//49 org.gnome.Sdk//49`).

### From source (any Linux)

```sh
# Fedora 44
sudo dnf install cargo webkit2gtk4.1-devel openssl-devel dbus-devel \
  pkgconf-pkg-config
cd src-tauri
cargo run --release
```

## Usage

1. Start your Sharkord server (e.g. `./sharkord` → `http://localhost:4991`)
2. Launch Hammerhead, add the server address (`localhost:4991`)
3. Click **Connect** — you're in the native client

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+H` | Back to server picker |
| `Ctrl+R` | Reload page |
| `Ctrl+Q` | Quit |

## Development

```
hammerhead/
├── src/               # picker UI (vanilla JS, no build step)
├── src-tauri/         # Rust shell (Tauri 2)
├── build-aux/         # Flatpak manifest + generated cargo sources
└── .github/workflows/ # CI: debug build, tests, flatpak bundle
```

- `cargo check` from `src-tauri/` for a quick compile check
- Regenerate Flatpak crate pins with
  [flatpak-cargo-generator](https://github.com/flatpak/flatpak-builder-tools/tree/master/cargo)
  whenever `Cargo.lock` changes:

  ```sh
  python3 flatpak-cargo-generator.py src-tauri/Cargo.lock \
    -o build-aux/cargo-sources.json
  ```

## Roadmap

- [x] Server picker with persistent server list
- [x] Flatpak packaging
- [ ] Desktop notifications
- [ ] Tray icon
- [ ] `hammerhead://` deep links
- [ ] RPM via COPR

## Known limitations

- Voice/video/screen sharing relies on WebKitGTK's WebRTC stack, which is
  less battle-tested than Chromium's. Text chat, logins, and file sharing
  work; if your server's voice channels misbehave in Hammerhead, report an
  issue with your WebKitGTK version (`webkit2gtk4.1 --version`).
- Sharkord is alpha software; expect churn.

## License

MIT — same as Sharkord itself.

## Acknowledgements

- [Sharkord](https://github.com/Sharkord/sharkord) and its team
- [Tauri](https://tauri.app) + WebKitGTK for the native shell