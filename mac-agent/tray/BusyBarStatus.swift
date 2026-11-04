import Cocoa
import EventKit
import ServiceManagement

// A menu-bar app that keeps the Node agent running, shows its state and reads the calendar.
//
// The agent is a child of this app, so everything the agent does is done "by" this app as far as
// macOS privacy settings go; the calendar is read here, in the app itself, so the permission prompt
// is shown once, for this app, and stays granted.

let home = FileManager.default.homeDirectoryForCurrentUser
let configDir = home.appendingPathComponent(".config/busybar-status")
let logURL = home.appendingPathComponent("Library/Logs/busybar-status.log")

struct Launch: Decodable { let node: String; let entry: String }

/// The menu's phrases in the app's language (the agent says which).
let texts: [String: [String: String]] = [
    "ru": ["running": "Агент работает · порт %d", "down": "Агент не отвечает · порт %d", "bar": "Бар: %@", "noBar": "Бар: не настроен", "calNo": "Календарь: нет доступа — открыть настройки", "calOk": "Календарь: доступ есть", "settings": "Настроить…", "restart": "Перезапустить", "quit": "Отключить"],
    "en": ["running": "Agent running · port %d", "down": "Agent not responding · port %d", "bar": "Bar: %@", "noBar": "Bar: not set up", "calNo": "Calendar: no access — open settings", "calOk": "Calendar: access granted", "settings": "Settings…", "restart": "Restart", "quit": "Quit"],
]

func readJSON(_ url: URL) -> [String: Any]? {
    guard let data = try? Data(contentsOf: url) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
}

final class App: NSObject, NSApplicationDelegate, NSMenuDelegate {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let menu = NSMenu()
    let store = EKEventStore()
    var agent: Process?
    var stopping = false
    var token = ""
    var port = 8787
    var iconStyle = ""
    var agentUp = false
    var calendarState = "unknown"   // unknown | ok | denied
    var lastLoginWish: Bool?        // what the agent's config last asked for
    var lang = "ru"
    var appIconMode = ""            // tray | dock | both | none
    var startMode = "tray"          // the same, from the config file, for the first moments

    // ---- start ---------------------------------------------------------------------------
    func applicationDidFinishLaunching(_ n: Notification) {
        menu.delegate = self
        item.menu = menu
        loadConfig()
        setIcon(iconStyle.isEmpty ? "mono" : iconStyle)
        showAs(startMode)
        startAgent()
        Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in self.pollAgent() }
        Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in self.pushCalendar() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.pushCalendar() }
    }

    func applicationWillTerminate(_ n: Notification) { stopAgent() }

    func loadConfig() {
        if let c = readJSON(configDir.appendingPathComponent("config.json")) {
            token = c["token"] as? String ?? ""
            port = c["port"] as? Int ?? 8787
            startMode = c["appIcon"] as? String ?? "tray"
        }
    }

    // ---- icon ----------------------------------------------------------------------------
    func setIcon(_ style: String) {
        guard style != iconStyle, let url = Bundle.main.url(forResource: "tray-" + style, withExtension: "png"), let img = NSImage(contentsOf: url) else { return }
        iconStyle = style
        img.size = NSSize(width: 22, height: 18)
        // The plain style is a template: macOS tints it for a light or a dark menu bar.
        img.isTemplate = (style == "mono")
        item.button?.image = img
        item.button?.toolTip = "Busybar status"
    }

    // ---- the agent process ---------------------------------------------------------------
    func startAgent() {
        guard agent == nil else { return }
        guard let launch = readLaunch() else { return }
        FileManager.default.createFile(atPath: logURL.path, contents: nil, attributes: nil)
        let p = Process()
        p.executableURL = URL(fileURLWithPath: launch.node)
        p.arguments = [launch.entry]
        p.currentDirectoryURL = URL(fileURLWithPath: launch.entry).deletingLastPathComponent().deletingLastPathComponent()
        var env = ProcessInfo.processInfo.environment
        env["BUSYBAR_TRAY"] = "1"
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        p.environment = env
        if let log = try? FileHandle(forWritingTo: logURL) {
            log.seekToEndOfFile()
            p.standardOutput = log
            p.standardError = log
        }
        p.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.agent = nil
                self.agentUp = false
                // If it died on its own, bring it back after a moment.
                if !self.stopping { DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.startAgent() } }
            }
        }
        do { try p.run(); agent = p } catch { NSLog("cannot start agent: \(error)") }
    }

    func readLaunch() -> Launch? {
        // A packaged app carries its own Node and agent inside the bundle.
        if let res = Bundle.main.resourcePath {
            let node = res + "/node/node"
            let entry = res + "/mac-agent/src/index.mjs"
            if FileManager.default.isExecutableFile(atPath: node), FileManager.default.fileExists(atPath: entry) { return Launch(node: node, entry: entry) }
        }
        guard let data = try? Data(contentsOf: configDir.appendingPathComponent("tray.json")) else { return nil }
        return try? JSONDecoder().decode(Launch.self, from: data)
    }

    func stopAgent() {
        stopping = true
        agent?.terminate()
        agent?.waitUntilExit()
        agent = nil
        stopping = false
    }

    @objc func restart() {
        stopAgent()
        loadConfig()
        agentUp = false
        startAgent()
    }

    @objc func quit() {
        stopAgent()
        NSApp.terminate(nil)
    }

    // ---- talking to the agent ------------------------------------------------------------
    func request(_ path: String, method: String = "GET", body: Data? = nil, done: ((Data?) -> Void)? = nil) {
        guard let url = URL(string: "http://127.0.0.1:\(port)\(path)") else { return }
        var r = URLRequest(url: url, timeoutInterval: 4)
        r.httpMethod = method
        r.setValue(token, forHTTPHeaderField: "X-Token")
        r.httpBody = body
        URLSession.shared.dataTask(with: r) { data, resp, _ in
            let ok = (resp as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { done?(ok ? data : nil) }
        }.resume()
    }

    func pollAgent() {
        loadConfig()
        request("/tray") { data in
            self.agentUp = data != nil
            if let d = data, let j = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] {
                if let icon = j["icon"] as? String { self.setIcon(icon) }
                if let want = j["launchAtLogin"] as? Bool { self.followLoginWish(want) }
                if let mode = j["appIcon"] as? String { self.showAs(mode) }
                if let l = j["lang"] as? String, texts[l] != nil { self.lang = l }
            }
            if data != nil, let body = try? JSONSerialization.data(withJSONObject: ["loginItem": self.loginStatus()]) {
                self.request("/tray-state", method: "POST", body: body)
            }
        }
    }

    // ---- login item ----------------------------------------------------------------------
    func loginStatus() -> String {
        switch SMAppService.mainApp.status {
        case .enabled: return "enabled"
        case .requiresApproval: return "requiresApproval"
        case .notFound: return "notFound"
        default: return "notRegistered"
        }
    }

    func loginIsOn() -> Bool {
        let s = SMAppService.mainApp.status
        return s == .enabled || s == .requiresApproval
    }

    /// Applies the switch from the settings page. Only a change of the wish counts, so a login item
    /// that was turned off in System Settings is not switched on again behind the user's back.
    func followLoginWish(_ want: Bool) {
        defer { lastLoginWish = want }
        if lastLoginWish == nil && !want { return }
        if lastLoginWish == want { return }
        setLogin(want)
    }

    func setLogin(_ on: Bool) {
        do {
            if on, !loginIsOn() { try SMAppService.mainApp.register() }
            if !on, loginIsOn() { try SMAppService.mainApp.unregister() }
        } catch {
            NSLog("login item: \(error)")
        }
    }

    // ---- where the app shows itself --------------------------------------------------------
    /// "tray": only the menu-bar icon; "dock": only the Dock icon; "both"; "none": neither, the settings
    /// page is then reached by its address in a browser.
    func showAs(_ mode: String) {
        guard mode != appIconMode else { return }
        appIconMode = mode
        item.isVisible = (mode == "tray" || mode == "both")
        NSApp.setActivationPolicy((mode == "dock" || mode == "both") ? .regular : .accessory)
        if mode == "dock" || mode == "both" { NSApp.applicationIconImage = NSImage(named: "AppIcon") }
    }

    /// A click on the Dock icon opens the settings.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openSettings()
        return true
    }

    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        let m = NSMenu()
        m.addItem(withTitle: s("settings"), action: #selector(openSettings), keyEquivalent: "").target = self
        m.addItem(withTitle: s("restart"), action: #selector(restart), keyEquivalent: "").target = self
        return m
    }

    // ---- calendar ------------------------------------------------------------------------
    func calendarGranted() -> Bool {
        let s = EKEventStore.authorizationStatus(for: .event)
        if #available(macOS 14.0, *) { return s == .fullAccess }
        return s == .authorized
    }

    func pushCalendar() {
        if calendarGranted() { return sendEvents() }
        if EKEventStore.authorizationStatus(for: .event) == .notDetermined {
            let done: (Bool) -> Void = { ok in DispatchQueue.main.async { ok ? self.sendEvents() : self.sendDenied() } }
            if #available(macOS 14.0, *) { store.requestFullAccessToEvents { ok, _ in done(ok) } } else { store.requestAccess(to: .event) { ok, _ in done(ok) } }
        } else {
            sendDenied()
        }
    }

    func sendDenied() {
        calendarState = "denied"
        post(["ok": false, "reason": "denied"])
    }

    func sendEvents() {
        calendarState = "ok"
        let now = Date()
        // From the start of today (the grid counts the day's finished meetings too) to five weeks ahead.
        let from = Calendar.current.startOfDay(for: now)
        let predicate = store.predicateForEvents(withStart: from, end: now.addingTimeInterval(35 * 24 * 3600), calendars: nil)
        let events = store.events(matching: predicate)
            .filter { !$0.isAllDay && $0.status != .canceled }
            .sorted { $0.startDate < $1.startDate }
            .prefix(300)
            .map { e -> [String: Any] in
                ["title": e.title ?? "", "start": Int(e.startDate.timeIntervalSince1970), "end": Int(e.endDate.timeIntervalSince1970), "calendar": e.calendar.title]
            }
        post(["ok": true, "events": Array(events)])
    }

    func post(_ object: [String: Any]) {
        guard let body = try? JSONSerialization.data(withJSONObject: object) else { return }
        request("/calendar-feed", method: "POST", body: body)
    }

    // ---- menu ----------------------------------------------------------------------------
    func s(_ key: String) -> String { texts[lang]?[key] ?? texts["ru"]?[key] ?? key }

    func menuWillOpen(_ menu: NSMenu) {
        loadConfig()
        pollAgent()
        menu.removeAllItems()
        func label(_ text: String) {
            let i = NSMenuItem(title: text, action: nil, keyEquivalent: "")
            i.isEnabled = false
            menu.addItem(i)
        }
        label("Busybar status")
        label(String(format: s(agentUp ? "running" : "down"), port))
        let barHost = ((readJSON(configDir.appendingPathComponent("config.json"))?["bar"] as? [String: Any])?["host"] as? String) ?? ""
        label(barHost.isEmpty ? s("noBar") : String(format: s("bar"), barHost))
        if calendarState == "denied" {
            menu.addItem(withTitle: s("calNo"), action: #selector(openCalendarPrivacy), keyEquivalent: "").target = self
        } else if calendarState == "ok" {
            label(s("calOk"))
        }
        menu.addItem(.separator())
        menu.addItem(withTitle: s("settings"), action: #selector(openSettings), keyEquivalent: ",").target = self
        menu.addItem(withTitle: s("restart"), action: #selector(restart), keyEquivalent: "r").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: s("quit"), action: #selector(quit), keyEquivalent: "q").target = self
    }

    @objc func openSettings() {
        if let url = URL(string: "http://127.0.0.1:\(port)/ui?t=\(token)") { NSWorkspace.shared.open(url) }
    }

    @objc func openCalendarPrivacy() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars") { NSWorkspace.shared.open(url) }
    }
}

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
