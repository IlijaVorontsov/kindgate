//
//  ViewController.swift
//  Kindgate (Mac)
//
//  The Mac app's one window: the setup steps for Safari on the Mac with their
//  live state, a button that opens Safari's extension settings, and an About
//  block (privacy policy, support, source, licences, version).
//
//  Where the state comes from:
//    - "extension enabled" is asked of Safari itself
//      (SFSafariExtensionManager.getStateOfSafariExtension), which the iPhone
//      cannot do;
//    - the two "allowed" rows under Needed, and the optional Every website row
//      under If you want, come from what the extension reports: three
//      yes/no answers when it starts and a site name reduced to youtube.com,
//      instagram.com or other when it runs on a page (background.js). The
//      native handler writes them into the App Group and this file reads them.
//
//  A build signed to run locally carries no App Group (Xcode signs one only
//  with a provisioning profile), so there the two site rows say that they
//  cannot be shown instead of waiting for ever, and Every website shows how
//  to allow it.
//
//  The app makes no network request. Links open in the browser.
//
//  Colours and type are the tokens of brand.css. The two typefaces are not
//  copied into the app: they are loaded from the extension bundled inside it,
//  the same files Safari uses, and the system serif and sans stand in if that
//  fails.
//
//  This file lives in the repo under app-mac/ and is copied over the
//  packager's file by build.sh --mac. It is one file on purpose, so the
//  generated project needs no new file references.
//

import Cocoa
import Combine
import CoreText
import SafariServices
import SwiftUI

let extensionBundleIdentifier = "app.kindgate.Extension"
private let appGroup = "group.app.kindgate"
private let statusKey = "kgStatus"

private let privacyURL = URL(string: "https://kindgate.app/privacy")!
private let supportURL = URL(string: "https://kindgate.app/support")!
private let sourceURL = URL(string: "https://github.com/IlijaVorontsov/kindgate")!

// MARK: - Brand (brand.css)

enum Brand {
    private static func rgb(_ hex: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
    /// One colour for a light ground and one for a dark ground.
    private static func pair(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? rgb(dark) : rgb(light)
        })
    }
    static let ground = pair(0xF6F1E8, 0x1F1D1A)     // cream / ink
    static let card = pair(0xEADFCE, 0x332F2A)       // sand / ink raised
    static let line = pair(0xD9CFBE, 0x433E37)       // line / ink raised 2
    static let text = pair(0x1F1D1A, 0xF6F1E8)       // ink / cream
    static let muted = pair(0x4A453E, 0xD9CFBE)      // ink muted / line
    static let link = pair(0x945414, 0xFFCF9E)       // amber ink / honey soft
    static let done = pair(0x4F6344, 0xA8BE97)       // sage deep / sage light
    static let honey = Color(nsColor: rgb(0xD98E3A))

    /// Registers Fraunces and Instrument Sans from the bundled extension.
    static let fontsLoaded: Bool = {
        let fonts = extensionResource("fonts")
        let files = fonts.flatMap { try? FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) } ?? []
        for file in files where file.pathExtension == "woff2" {
            CTFontManagerRegisterFontsForURL(file as CFURL, .process, nil)
        }
        return NSFont(name: "Fraunces-Regular", size: 12) != nil
            && NSFont(name: "InstrumentSans-Regular", size: 12) != nil
    }()

    static func display(_ size: CGFloat) -> Font {
        fontsLoaded ? .custom("Fraunces", size: size).weight(.semibold)
                    : .system(size: size, weight: .semibold, design: .serif)
    }
    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        fontsLoaded ? .custom("Instrument Sans", size: size).weight(weight)
                    : .system(size: size, weight: weight)
    }
}

/// A file or folder of the extension that ships inside this app.
func extensionResource(_ path: String) -> URL? {
    guard let plugIns = Bundle.main.builtInPlugInsURL,
          let items = try? FileManager.default.contentsOfDirectory(at: plugIns, includingPropertiesForKeys: nil),
          let appex = items.first(where: { $0.pathExtension == "appex" }) else { return nil }
    let url = appex.appendingPathComponent("Contents/Resources").appendingPathComponent(path)
    return FileManager.default.fileExists(atPath: url.path) ? url : nil
}

// MARK: - Status

/// What Safari says about the extension.
enum ExtensionState: Equatable {
    case checking, enabled, disabled
    /// Safari could not answer, usually because it has not seen this app yet.
    case unknown
}

/// What the extension last reported through the App Group.
struct ReportedStatus: Equatable {
    var alive: Date?
    var hosts: [String: Date] = [:]       // youtube.com / instagram.com / other -> last seen
    var granted: [String: Bool] = [:]     // youtube / instagram / other

    static func read() -> ReportedStatus {
        let d = UserDefaults(suiteName: appGroup)?.dictionary(forKey: statusKey) ?? [:]
        func date(_ v: Any?) -> Date? {
            guard let ms = (v as? NSNumber)?.doubleValue, ms > 0 else { return nil }
            return Date(timeIntervalSince1970: ms / 1000)
        }
        return ReportedStatus(alive: date(d["alive"]),
                              hosts: ((d["hosts"] as? [String: Any]) ?? [:]).compactMapValues(date),
                              granted: d["granted"] as? [String: Bool] ?? [:])
    }
}

/// Whether this copy of the app was signed with the App Group. Read from the
/// running process's own signature.
let signedWithAppGroup: Bool = {
    guard let task = SecTaskCreateFromSelf(nil),
          let value = SecTaskCopyValueForEntitlement(task, "com.apple.security.application-groups" as CFString, nil)
    else { return false }
    return (value as? [String])?.contains(appGroup) == true
}()

final class SetupModel: ObservableObject {
    var groupAvailable = signedWithAppGroup
    @Published var state: ExtensionState = .checking
    @Published var reported = ReportedStatus()
    @Published var settingsError = false
    /// Safari's own error for the last failed call, shown under the note so a
    /// report can name it. Domain and code only: no user data is in it.
    @Published var settingsErrorDetail = ""
    @Published var showLicences = false
    private var timer: Timer?

    func start() {
        refresh()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.refresh() }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func refresh() {
        if groupAvailable {
            let fresh = ReportedStatus.read()
            if fresh != reported { reported = fresh }
        }
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { [weak self] state, error in
            let next: ExtensionState = (state == nil || error != nil) ? .unknown
                : (state?.isEnabled == true ? .enabled : .disabled)
            DispatchQueue.main.async {
                if self?.state != next { self?.state = next }
            }
        }
    }

    func openSafariSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { [weak self] error in
            DispatchQueue.main.async {
                self?.settingsError = error != nil
                if let e = error as NSError? { self?.settingsErrorDetail = "\(e.domain) \(e.code)" } else { self?.settingsErrorDetail = "" }
            }
        }
    }
}

/// Opens a page in Safari, whichever browser is the default: the steps are
/// about Safari.
func openInSafari(_ url: URL) {
    if let safari = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari") {
        NSWorkspace.shared.open([url], withApplicationAt: safari, configuration: NSWorkspace.OpenConfiguration())
    } else {
        NSWorkspace.shared.open(url)
    }
}

// MARK: - Rows

/// `optional`: a row that is never unfinished, only on or not in use.
enum StepState: Equatable { case done, todo, waiting, optional }

struct Step: Identifiable, Equatable {
    let title: String
    let detail: String
    let state: StepState
    var open: URL?
    var id: String { title }
}

/// The three steps the feeds need. Every website is not one of them: see
/// optionalSteps.
func buildSteps(_ state: ExtensionState, _ r: ReportedStatus, groupAvailable: Bool = true, now: Date = Date()) -> [Step] {
    let fmt = RelativeDateTimeFormatter()
    fmt.unitsStyle = .full
    func ago(_ d: Date) -> String { fmt.localizedString(for: d, relativeTo: now) }

    let ext: Step
    switch state {
    case .enabled:
        ext = Step(title: "Extension turned on", detail: "On in Safari.", state: .done)
    case .disabled:
        ext = Step(title: "Extension turned on",
                   detail: "Off. Open Safari’s extension settings below and tick Kindgate in the list.",
                   state: .todo)
    case .unknown:
        ext = Step(title: "Extension turned on",
                   detail: "Safari does not list Kindgate yet. Open Safari once, then come back to this window.",
                   state: .todo)
    case .checking:
        ext = Step(title: "Extension turned on", detail: "Asking Safari…", state: .waiting)
    }

    func site(_ title: String, host: String, key: String, how: String, open: String) -> Step {
        guard groupAvailable else {
            return Step(title: title,
                        detail: "Cannot be shown in this build: it was signed to run locally, without the App Group the extension reports through.",
                        state: .waiting)
        }
        guard state == .enabled else {
            return Step(title: title, detail: "Turn the extension on first.", state: .waiting)
        }
        if let seen = r.hosts[host] {
            return Step(title: title, detail: "Kindgate ran there \(ago(seen)).", state: .done)
        }
        if r.granted[key] == true {
            return Step(title: title, detail: "Allowed in Safari.", state: .done)
        }
        return Step(title: title, detail: how, state: .todo, open: URL(string: open))
    }
    let toolbar = "click Kindgate in Safari’s toolbar and choose"
    return [
        ext,
        site("youtube.com allowed", host: "youtube.com", key: "youtube",
             how: "Not seen yet. Open youtube.com in Safari, \(toolbar) Always Allow on This Website.",
             open: "https://www.youtube.com/"),
        site("instagram.com allowed", host: "instagram.com", key: "instagram",
             how: "Not seen yet. Open instagram.com in Safari, \(toolbar) Always Allow on This Website.",
             open: "https://www.instagram.com/"),
    ]
}

/// "If you want": every website, which the feeds do not need.
func optionalSteps(_ state: ExtensionState, _ r: ReportedStatus, groupAvailable: Bool = true, now: Date = Date()) -> [Step] {
    let fmt = RelativeDateTimeFormatter()
    fmt.unitsStyle = .full
    let title = "Every website"
    let why = "Only for the video keys on other sites, and for the night page, the warm screen and the pause if you switch them on under More help. The feeds do not need it."
    if groupAvailable, state == .enabled {
        if let seen = r.hosts["other"] {
            return [Step(title: title, detail: "Allowed. Kindgate ran on another site \(fmt.localizedString(for: seen, relativeTo: now)).", state: .done)]
        }
        if r.granted["other"] == true {
            return [Step(title: title, detail: "Allowed in Safari.", state: .done)]
        }
    }
    return [Step(title: title,
                 detail: why + " To allow it: open any page in Safari, click Kindgate in Safari’s toolbar and choose Always Allow on Every Website.",
                 state: .optional, open: URL(string: "https://www.wikipedia.org/"))]
}

// MARK: - Views

struct SetupView: View {
    @ObservedObject var model: SetupModel

    private var version: String {
        let info = Bundle.main.infoDictionary ?? [:]
        let v = info["CFBundleShortVersionString"] as? String ?? "?"
        let b = info["CFBundleVersion"] as? String ?? "?"
        return "Kindgate \(v) (\(b))"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                card("Needed") {
                    let steps = buildSteps(model.state, model.reported, groupAvailable: model.groupAvailable)
                    ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                        if index > 0 { divider }
                        StepRow(step: step)
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    Button("Open Safari Extension Settings…") { model.openSafariSettings() }
                        .buttonStyle(PrimaryButton())
                    if model.settingsError {
                        note("Safari did not open its settings. Open Safari, then Settings › Extensions, and pick Kindgate.")
                        if !model.settingsErrorDetail.isEmpty { note("Safari’s answer: \(model.settingsErrorDetail)") }
                    }
                    note("The first row is Safari’s own answer. The others are reported by the extension and update while this window is open. That is all Kindgate needs.")
                }
                card("If you want") {
                    ForEach(optionalSteps(model.state, model.reported, groupAvailable: model.groupAvailable)) { step in
                        StepRow(step: step)
                    }
                }
                card("About") {
                    LinkRow(title: "Privacy policy", detail: "kindgate.app/privacy", symbol: "hand.raised") {
                        NSWorkspace.shared.open(privacyURL)
                    }
                    divider
                    LinkRow(title: "Support", detail: "kindgate.app/support", symbol: "questionmark.circle") {
                        NSWorkspace.shared.open(supportURL)
                    }
                    divider
                    LinkRow(title: "Source code", detail: "github.com/IlijaVorontsov/kindgate", symbol: "chevron.left.forwardslash.chevron.right") {
                        NSWorkspace.shared.open(sourceURL)
                    }
                    divider
                    LinkRow(title: "Open source licences", detail: "Kindgate, the typefaces and the pause lists.", symbol: "doc.text") {
                        model.showLicences = true
                    }
                }
                VStack(alignment: .leading, spacing: 4) {
                    note("No account, no server, no analytics. Everything Kindgate stores stays on this Mac.")
                    note(version)
                }
            }
            .padding(24)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Brand.ground)
        .sheet(isPresented: $model.showLicences) { LicencesView { model.showLicences = false } }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 64, height: 64)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text("Set up Kindgate")
                    .font(Brand.display(28))
                    .foregroundStyle(Brand.text)
                Text("Kindgate works inside Safari. Two sites to allow, and the feeds are clean.")
                    .font(Brand.body(13))
                    .foregroundStyle(Brand.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var divider: some View {
        Rectangle().fill(Brand.line).frame(height: 1).padding(.leading, 44)
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(Brand.body(11))
            .foregroundStyle(Brand.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func card<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(Brand.body(11, .semibold))
                .kerning(0.6)
                .foregroundStyle(Brand.link)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 0) { content() }
                .background(Brand.card)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}

private struct StepRow: View {
    let step: Step

    private var symbol: (name: String, color: Color, label: String) {
        switch step.state {
        case .done: return ("checkmark.circle.fill", Brand.done, "Done")
        case .todo: return ("circle", Brand.muted, "To do")
        case .waiting: return ("circle.dotted", Brand.muted, "Waiting")
        case .optional: return ("globe", Brand.muted, "Optional")
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol.name)
                .font(.system(size: 18))
                .foregroundStyle(symbol.color)
                .frame(width: 20)
                .accessibilityLabel(symbol.label)
            VStack(alignment: .leading, spacing: 2) {
                Text(step.title).font(Brand.body(13, .semibold)).foregroundStyle(Brand.text)
                Text(step.detail).font(Brand.body(12)).foregroundStyle(Brand.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            if let url = step.open {
                Button("Open in Safari") { openInSafari(url) }
                    .buttonStyle(QuietButton())
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }
}

private struct LinkRow: View {
    let title: String
    let detail: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: symbol).font(.system(size: 15)).foregroundStyle(Brand.muted).frame(width: 20)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(Brand.body(13, .semibold)).foregroundStyle(Brand.text)
                    Text(detail).font(Brand.body(12)).foregroundStyle(Brand.muted)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Brand.muted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Ink on cream, cream on ink: the primary button of brand.css.
private struct PrimaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Brand.body(13, .semibold))
            .foregroundStyle(Brand.ground)
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .background(Brand.text.opacity(configuration.isPressed ? 0.8 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct QuietButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Brand.body(12, .semibold))
            .foregroundStyle(Brand.link.opacity(configuration.isPressed ? 0.6 : 1))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .overlay(RoundedRectangle(cornerRadius: 999, style: .continuous).stroke(Brand.line, lineWidth: 1))
    }
}

// MARK: - Licences

/// The notices for everything in the bundle. The OFL and the lists' MIT text
/// are read from the extension inside this app, the copies that ship.
func licenceText() -> String {
    func bundled(_ path: String) -> String {
        guard let url = extensionResource(path), let text = try? String(contentsOf: url, encoding: .utf8) else {
            return "(\(path) is in the extension: in Safari, open Kindgate and look under About, Open source licences.)"
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return """
    KINDGATE
    Open source under the Mozilla Public License 2.0.
    Licence: https://www.mozilla.org/MPL/2.0/
    Source code: https://github.com/IlijaVorontsov/kindgate

    TYPEFACES
    Fraunces. Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)
    Instrument Sans. Copyright 2022 The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans)
    Both under the SIL Open Font License, Version 1.1:

    \(bundled("fonts/OFL.txt"))

    READY-MADE PAUSE LISTS
    Derived from StevenBlack/hosts (https://github.com/StevenBlack/hosts), under the MIT License:

    \(bundled("lists/LICENSE"))
    """
}

private struct LicencesView: View {
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Open source licences").font(Brand.display(20)).foregroundStyle(Brand.text)
            ScrollView {
                Text(licenceText())
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Brand.text)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
            }
            .background(Brand.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            HStack {
                Spacer()
                Button("Done", action: close).keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 560, height: 520)
        .background(Brand.ground)
    }
}

// MARK: - View controller

class ViewController: NSViewController {

    private let model = SetupModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        let host = NSHostingView(rootView: SetupView(model: model))
        host.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host)
        NSLayoutConstraint.activate([
            host.topAnchor.constraint(equalTo: view.topAnchor),
            host.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        NotificationCenter.default.addObserver(self, selector: #selector(becameActive),
                                               name: NSApplication.didBecomeActiveNotification, object: nil)
    }

    override func viewWillAppear() {
        super.viewWillAppear()
        model.start()
    }

    override func viewDidDisappear() {
        super.viewDidDisappear()
        model.stop()
    }

    @objc private func becameActive() { model.refresh() }
}
