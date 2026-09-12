use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

#[derive(Serialize, Deserialize, Clone)]
struct ServerEntry {
    id: u64,
    name: String,
    url: String,
}

#[derive(Default)]
struct AppState {
    app_index_url: Mutex<Option<String>>,
    connected_host: Mutex<Option<String>>,
}

fn servers_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("app data dir must be resolvable");
    fs::create_dir_all(&dir).ok();
    dir.join("servers.json")
}

fn save_servers(app: &AppHandle, servers: &[ServerEntry]) {
    let path = servers_path(app);
    let _ = fs::write(&path, serde_json::to_string_pretty(servers).unwrap_or_default());
}

fn read_servers(app: &AppHandle) -> Vec<ServerEntry> {
    let path = servers_path(app);
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
fn list_servers(app: AppHandle) -> Vec<ServerEntry> {
    read_servers(&app)
}

#[tauri::command]
fn add_server(app: AppHandle, name: String, url: String) -> Result<Vec<ServerEntry>, String> {
    let normalized = normalize_url_inner(&url)?;
    let mut servers = read_servers(&app);
    let id = servers.last().map(|s| s.id + 1).unwrap_or(1);
    servers.push(ServerEntry {
        id,
        name: name.trim().to_string(),
        url: normalized,
    });
    save_servers(&app, &servers);
    Ok(servers)
}

#[tauri::command]
fn remove_server(app: AppHandle, id: u64) -> Vec<ServerEntry> {
    let mut servers = read_servers(&app);
    servers.retain(|s| s.id != id);
    save_servers(&app, &servers);
    servers
}

/// Normalize an address entered by the user into a full URL.
/// - explicit http:// or https:// is kept as-is
/// - localhost-ish hosts default to http://
/// - everything else defaults to https://
#[tauri::command]
fn normalize_url(input: String) -> Result<String, String> {
    normalize_url_inner(&input)
}

fn normalize_url_inner(input: &str) -> Result<String, String> {
    let input_trimmed = input.trim().trim_end_matches('/');
    if input_trimmed.is_empty() {
        return Err("Enter a server address".to_string());
    }
    let (scheme, host_part): (&str, String) = if let Some(rest) = input_trimmed.strip_prefix("http://") {
        ("http", rest.to_string())
    } else if let Some(rest) = input_trimmed.strip_prefix("https://") {
        ("https", rest.to_string())
    } else {
        let is_local = input_trimmed.starts_with("localhost")
            || input_trimmed.starts_with("127.0.0.1")
            || input_trimmed.starts_with("[::1]")
            || input_trimmed.ends_with(".local");
        if is_local {
            ("http", input_trimmed.to_string())
        } else {
            ("https", input_trimmed.to_string())
        }
    };

    let parsed = Url::parse(&format!("{scheme}://{host_part}"))
        .map_err(|_| "Invalid server address".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Only http and https servers are supported".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or("Server address must include a host".to_string())?;
    if host.is_empty() {
        return Err("Server address must include a host".to_string());
    }
    let mut result = format!("{}://{}", parsed.scheme(), host);
    if let Some(port) = parsed.port() {
        result.push_str(&format!(":{port}"));
    }
    Ok(result)
}

#[tauri::command]
fn connect_server(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| "Invalid URL".to_string())?;
    let window = app
        .get_webview_window("main")
        .ok_or("main window missing")?;
    window
        .navigate(parsed.clone())
        .map_err(|e| e.to_string())?;
    if let Some(host) = parsed.host_str() {
        let state: tauri::State<AppState> = app.state();
        *state.connected_host.lock().unwrap() = Some(host.to_string());
        let _ = window.set_title(&format!("Hammerhead — {host}"));
    }
    Ok(())
}

#[tauri::command]
fn show_picker(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("main window missing")?;
    let state: tauri::State<AppState> = app.state();
    let app_index_url = state
        .app_index_url
        .lock()
        .unwrap()
        .clone()
        .ok_or("app index URL unknown")?;
    let url = Url::parse(&app_index_url).map_err(|e| e.to_string())?;
    window
        .navigate(url)
        .map_err(|e| e.to_string())?;
    *state.connected_host.lock().unwrap() = None;
    let _ = window.set_title("Hammerhead");
    Ok(())
}

#[tauri::command]
fn current_host(app: AppHandle) -> Option<String> {
    let state: tauri::State<AppState> = app.state();
    let host = state.connected_host.lock().unwrap().clone();
    host
}

fn remember_app_index_url(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(url) = window.url() else {
        return;
    };
    let mut origin = format!("{}://", url.scheme());
    if let Some(host) = url.host_str() {
        origin.push_str(host);
    }
    if let Some(port) = url.port() {
        origin.push_str(&format!(":{port}"));
    }
    origin.push_str("/index.html");
    let state: tauri::State<AppState> = app.state();
    *state.app_index_url.lock().unwrap() = Some(origin);
}

fn build_main_window(handle: &AppHandle) -> Result<tauri::WebviewWindow, tauri::Error> {
    let app = handle.clone();
    let window = WebviewWindowBuilder::new(handle, "main", WebviewUrl::App("index.html".into()))
        .title("Hammerhead")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 500.0)
        .on_navigation(move |url| {
            let is_app_url = url.scheme() == "tauri"
                || url.scheme() == "about"
                || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"));
            if !is_app_url {
                if let Some(host) = url.host_str() {
                    let state: tauri::State<AppState> = app.state();
                    *state.connected_host.lock().unwrap() = Some(host.to_string());
                }
            }
            true
        })
        .build()?;

    install_permission_handler(&window);
    Ok(window)
}

/// WebKitGTK emits `permission-request` when a page calls getUserMedia
/// (joining a Sharkord voice channel) or wants notifications. Neither wry
/// nor Tauri answers this signal by default, so WebKit denies the request
/// and voice join silently fails. Additionally, media-stream support itself
/// must be enabled on the WebKit settings. This:
///   1. enables media streams + WebRTC (needed for mediasoup-client)
///   2. grants media/notification permission requests, denies others
#[cfg(target_os = "linux")]
fn install_permission_handler(window: &tauri::WebviewWindow) {
    use webkit2gtk::glib::prelude::*;
    use webkit2gtk::PermissionRequestExt;
    use webkit2gtk::SettingsExt;
    use webkit2gtk::WebViewExt;

    let _ = window.with_webview(|webview: tauri::webview::PlatformWebview| {
        let view = webview.inner();

        if let Some(settings) = view.settings() {
            settings.set_enable_media(true);
            settings.set_enable_media_stream(true);
            settings.set_enable_webrtc(true);
            settings.set_enable_encrypted_media(true);
        }

        view.connect_permission_request(|_, request| {
            let is_media = request
                .downcast_ref::<webkit2gtk::UserMediaPermissionRequest>()
                .is_some();
            let is_notification = request
                .downcast_ref::<webkit2gtk::NotificationPermissionRequest>()
                .is_some();
            if is_media || is_notification {
                request.allow();
            } else {
                request.deny();
            }
            true
        });
    });
}

#[cfg(not(target_os = "linux"))]
fn install_permission_handler(_window: &tauri::WebviewWindow) {}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            list_servers,
            add_server,
            remove_server,
            normalize_url,
            connect_server,
            show_picker,
            current_host
        ])
        .setup(|app| {
            use tauri::menu::{MenuBuilder, MenuItem};
            let picker_item =
                MenuItem::with_id(app, "picker", "Server picker", true, Some("CmdOrCtrl+Shift+H"))?;
            let reload_item =
                MenuItem::with_id(app, "reload", "Reload page", true, Some("CmdOrCtrl+R"))?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?;
            let menu = MenuBuilder::new(app)
                .item(&picker_item)
                .item(&reload_item)
                .separator()
                .item(&quit_item)
                .build()?;
            app.set_menu(menu)?;

            let window = build_main_window(app.handle())?;
            window.show()?;
            remember_app_index_url(app.handle());
            Ok(())
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "picker" => {
                    let _ = show_picker(app.clone());
                }
                "reload" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.eval("location.reload()");
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running hammerhead");
}