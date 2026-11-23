//
//  ViewController.swift
//  Kindgate
//
//  The setup checklist. "Needed" holds the three steps the feeds need: the
//  extension, youtube.com and instagram.com. "If you want" holds two rows that
//  never show as unfinished: Make it stick (delete the apps, use the sites
//  from the Home Screen; tapping it opens those four steps) and Other
//  Websites, which only the opt-in parts under More help use. Every row shows
//  live status:
//    - the extension and the allowed sites come from timestamps the extension
//      writes into the App Group (see background.js and
//      SafariWebExtensionHandler.swift) — iOS offers no API for either;
//    - "app deleted" comes from canOpenURL on the apps' URL schemes
//      (LSApplicationQueriesSchemes is set by build.sh);
//    - "on the Home Screen" comes from navigator.standalone, reported by the
//      content script when the page was opened from the Home Screen.
//
//  Below the checklist, an About section links the privacy policy and the
//  support page and shows the open source notices (App Review guideline
//  5.1.1(i) wants the policy reachable inside the app).
//
//  This file lives in the repo under app/ and is copied over the converter's
//  file by build.sh. It is deliberately a single file with no storyboard
//  outlets so the generated project needs no new file references.
//

import UIKit

private let appGroup = "group.app.kindgate"
private let statusKey = "kgStatus"
private let staleAfter: TimeInterval = 7 * 24 * 3600

private let privacyURL = URL(string: "https://kindgate.app/privacy")
private let supportURL = URL(string: "https://kindgate.app/support")
/// Not an address to open: tapping this row shows the licences screen.
private let licencesAction = URL(string: "kindgate-internal:licences")
/// Not an address to open: tapping this row shows the "make it stick" steps.
private let stickAction = URL(string: "kindgate-internal:stick")

// MARK: - Brand

/// The two palette entries the checklist needs, from brand.css. Everything
/// else stays a system colour so the list still reads as native iOS.
private enum Brand {
    /// Sage on a light ground, the lighter sage on a dark one.
    static let sage = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.659, green: 0.745, blue: 0.592, alpha: 1)   // #A8BE97
            : UIColor(red: 0.435, green: 0.518, blue: 0.380, alpha: 1)   // #6F8461
    }
    /// Honey, for a step that was done once and has gone quiet since.
    static let honey = UIColor(red: 0.851, green: 0.557, blue: 0.227, alpha: 1)  // #D98E3A
}

// MARK: - Status

private struct SetupStatus {
    let alive: Date?
    let hosts: [String: Date]        // youtube.com / instagram.com / other -> last seen
    let standalone: [String: Date]   // host -> last opened from the Home Screen
    let granted: [String: Bool]      // youtube / instagram / other -> granted in Safari, best effort
    let youtubeApp: Bool
    let instagramApp: Bool

    static func read() -> SetupStatus {
        let d = UserDefaults(suiteName: appGroup)?.dictionary(forKey: statusKey) ?? [:]
        func date(_ v: Any?) -> Date? {
            guard let ms = (v as? NSNumber)?.doubleValue, ms > 0 else { return nil }
            return Date(timeIntervalSince1970: ms / 1000)
        }
        func dates(_ v: Any?) -> [String: Date] {
            ((v as? [String: Any]) ?? [:]).compactMapValues(date)
        }
        func installed(_ scheme: String) -> Bool {
            guard let url = URL(string: scheme + "://") else { return false }
            return UIApplication.shared.canOpenURL(url)
        }
        return SetupStatus(
            alive: date(d["alive"]),
            hosts: dates(d["hosts"]),
            standalone: dates(d["standalone"]),
            granted: d["granted"] as? [String: Bool] ?? [:],
            youtubeApp: installed("youtube"),
            instagramApp: installed("instagram"))
    }

    func isGranted(_ key: String) -> Bool {
        granted[key] == true
    }
}

// MARK: - Rows

private enum RowState: Equatable {
    case done, todo, stale
    /// Not a step: a row that leads somewhere, drawn with this SF Symbol.
    case link(String)
}

private struct Row: Equatable {
    let title: String
    let detail: String
    let state: RowState
    let action: URL?
}

private struct Section: Equatable {
    let header: String
    let footer: String
    let rows: [Row]
}

private func buildSections(_ s: SetupStatus) -> [Section] {
    let fmt = RelativeDateTimeFormatter()
    fmt.unitsStyle = .full
    let now = Date()
    func ago(_ d: Date) -> String { fmt.localizedString(for: d, relativeTo: now) }

    let settings = URL(string: UIApplication.openSettingsURLString)
    let settingsPath = "Settings › Apps › Safari › Extensions › Kindgate"

    // 1. Extension enabled
    let extRow: Row
    if let a = s.alive {
        if now.timeIntervalSince(a) > staleAfter {
            extRow = Row(title: "Extension enabled",
                         detail: "Last seen \(ago(a)). Check it is still on under \(settingsPath).",
                         state: .stale, action: settings)
        } else {
            extRow = Row(title: "Extension enabled", detail: "Seen \(ago(a)).", state: .done, action: nil)
        }
    } else {
        extRow = Row(title: "Extension enabled",
                     detail: "Not seen yet. Turn it on under \(settingsPath), then open Safari once.",
                     state: .todo, action: settings)
    }

    // 2–3. Sites allowed
    func site(_ host: String, key: String, open: String) -> Row {
        let url = URL(string: open)
        if let seen = s.hosts[host] {
            return Row(title: "\(host) allowed", detail: "Seen \(ago(seen)).", state: .done, action: nil)
        }
        if s.isGranted(key) {
            return Row(title: "\(host) allowed", detail: "Allowed in Safari. Not opened yet.", state: .done, action: url)
        }
        return Row(title: "\(host) allowed",
                   detail: "Not seen yet. Tap to open \(host) in Safari, then choose Allow (Always Allow) when Safari asks.",
                   state: .todo, action: url)
    }
    let yt = site("youtube.com", key: "youtube", open: "https://m.youtube.com/")
    let ig = site("instagram.com", key: "instagram", open: "https://www.instagram.com/")

    // If you want: Other Websites. Optional, so never drawn as unfinished.
    let otherRow: Row
    if let seen = s.hosts["other"] {
        otherRow = Row(title: "Other Websites", detail: "Allowed. Seen \(ago(seen)).", state: .done, action: nil)
    } else if s.isGranted("other") {
        otherRow = Row(title: "Other Websites", detail: "Allowed in Safari.", state: .done, action: nil)
    } else {
        otherRow = Row(title: "Other Websites",
                       detail: "Not needed for the feeds. Only the night page, the warm screen and the pause use it, if you switch them on under More help in Kindgate. Then set Other Websites to Allow under \(settingsPath).",
                       state: .link("globe"), action: settings)
    }

    let stick = stickRows(s)
    let stuck = stick.filter { $0.state == .done }.count
    let stickRow = Row(title: "Make it stick",
                       detail: stuck == stick.count
                           ? "Both apps gone, both sites on the Home Screen."
                           : "Use the two sites from your Home Screen instead of their apps. Show me how.",
                       state: stuck == stick.count ? .done : .link("house"), action: stickAction)

    return [
        Section(header: "Needed",
                footer: "Each row turns green on its own. That is all Kindgate needs.",
                rows: [extRow, yt, ig]),
        Section(header: "If you want",
                footer: "Neither is needed for the feeds.",
                rows: [stickRow, otherRow]),
        Section(header: "About",
                footer: "No account, no server, no analytics. Everything Kindgate stores stays on this device.",
                rows: [Row(title: "Privacy policy", detail: "kindgate.app/privacy",
                           state: .link("hand.raised"), action: privacyURL),
                       Row(title: "Support", detail: "kindgate.app/support",
                           state: .link("questionmark.circle"), action: supportURL),
                       Row(title: "Open source licences", detail: "Kindgate, the typefaces and the pause lists.",
                           state: .link("doc.text"), action: licencesAction)]),
    ]
}

/// The four "make it stick" steps, shown when the Make it stick row is tapped.
private func stickRows(_ s: SetupStatus) -> [Row] {
    let fmt = RelativeDateTimeFormatter()
    fmt.unitsStyle = .full
    let now = Date()
    func ago(_ d: Date) -> String { fmt.localizedString(for: d, relativeTo: now) }

    func app(_ name: String, installed: Bool) -> Row {
        installed
            ? Row(title: "\(name) app deleted",
                  detail: "Still installed. Press and hold its icon › Remove App › Delete App.",
                  state: .todo, action: nil)
            : Row(title: "\(name) app deleted", detail: "Not installed.", state: .done, action: nil)
    }
    func home(_ host: String, open: String) -> Row {
        if let d = s.standalone[host] {
            return Row(title: "\(host) on the Home Screen", detail: "Opened from there \(ago(d)).", state: .done, action: nil)
        }
        return Row(title: "\(host) on the Home Screen",
                   detail: "In Safari open \(host), tap Share › Add to Home Screen, then open it from there once.",
                   state: .todo, action: URL(string: open))
    }

    return [app("YouTube", installed: s.youtubeApp),
            app("Instagram", installed: s.instagramApp),
            home("youtube.com", open: "https://m.youtube.com/"),
            home("instagram.com", open: "https://www.instagram.com/")]
}

/// One checklist row drawn into a cell; shared by both screens.
private func configure(_ cell: UITableViewCell, with row: Row) {
    var content = cell.defaultContentConfiguration()
    content.text = row.title
    content.secondaryText = row.detail
    content.secondaryTextProperties.color = .secondaryLabel
    content.secondaryTextProperties.numberOfLines = 0
    content.textToSecondaryTextVerticalPadding = 2
    switch row.state {
    case .done:
        content.image = UIImage(systemName: "checkmark.circle.fill")
        content.imageProperties.tintColor = Brand.sage
    case .stale:
        content.image = UIImage(systemName: "exclamationmark.circle.fill")
        content.imageProperties.tintColor = Brand.honey
    case .todo:
        content.image = UIImage(systemName: "circle")
        content.imageProperties.tintColor = .tertiaryLabel
    case .link(let symbol):
        content.image = UIImage(systemName: symbol)
        content.imageProperties.tintColor = .secondaryLabel
    }
    content.imageProperties.preferredSymbolConfiguration = UIImage.SymbolConfiguration(textStyle: .title2)
    cell.contentConfiguration = content
    cell.accessoryType = row.action == nil ? .none : .disclosureIndicator
    cell.selectionStyle = row.action == nil ? .none : .default
}

// MARK: - View controller

class ViewController: UIViewController, UITableViewDataSource, UITableViewDelegate {

    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private var sections: [Section] = []
    private var timer: Timer?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground

        tableView.dataSource = self
        tableView.delegate = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "row")
        tableView.tableHeaderView = makeHeader()
        tableView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tableView)
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        NotificationCenter.default.addObserver(self, selector: #selector(refresh),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
        refresh()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        refresh()
        timer?.invalidate()
        timer = Timer.scheduledTimer(timeInterval: 2, target: self, selector: #selector(refresh),
                                     userInfo: nil, repeats: true)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        timer?.invalidate()
        timer = nil
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // Size the header to its content once the table knows its width.
        if let header = tableView.tableHeaderView {
            let target = CGSize(width: tableView.bounds.width, height: UIView.layoutFittingCompressedSize.height)
            let h = header.systemLayoutSizeFitting(target, withHorizontalFittingPriority: .required,
                                                   verticalFittingPriority: .fittingSizeLevel).height
            if abs(header.frame.height - h) > 0.5 {
                header.frame.size.height = h
                tableView.tableHeaderView = header
            }
        }
    }

    private func makeHeader() -> UIView {
        let title = UILabel()
        title.text = "Set up Kindgate"
        title.font = .preferredFont(forTextStyle: .largeTitle)
        title.font = UIFont.boldSystemFont(ofSize: title.font.pointSize)
        title.adjustsFontForContentSizeCategory = true
        title.numberOfLines = 0

        let sub = UILabel()
        sub.text = "Kindgate works inside Safari. Two sites to allow, and the feeds are clean."
        sub.font = .preferredFont(forTextStyle: .body)
        sub.textColor = .secondaryLabel
        sub.adjustsFontForContentSizeCategory = true
        sub.numberOfLines = 0

        let stack = UIStackView(arrangedSubviews: [title, sub])
        stack.axis = .vertical
        stack.spacing = 8
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 24, leading: 20, bottom: 8, trailing: 20)

        let wrapper = UIView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        wrapper.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: wrapper.topAnchor),
            stack.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: wrapper.safeAreaLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: wrapper.safeAreaLayoutGuide.trailingAnchor),
        ])
        return wrapper
    }

    @objc private func refresh() {
        let fresh = buildSections(SetupStatus.read())
        guard fresh != sections else { return }
        sections = fresh
        tableView.reloadData()
    }

    // MARK: Table

    func numberOfSections(in tableView: UITableView) -> Int { sections.count }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        sections[section].rows.count
    }

    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        sections[section].header
    }

    func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        sections[section].footer
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "row", for: indexPath)
        configure(cell, with: sections[indexPath.section].rows[indexPath.row])
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard let url = sections[indexPath.section].rows[indexPath.row].action else { return }
        if url == licencesAction {
            present(UINavigationController(rootViewController: LicencesViewController()), animated: true)
            return
        }
        if url == stickAction {
            present(UINavigationController(rootViewController: StickViewController()), animated: true)
            return
        }
        UIApplication.shared.open(url)
    }
}

// MARK: - Make it stick

/// The four optional steps behind the Make it stick row, with their live state.
private final class StickViewController: UITableViewController {

    private var rows: [Row] = []

    init() { super.init(style: .insetGrouped) }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Make it stick"
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self,
                                                            action: #selector(closeTapped))
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "row")
        NotificationCenter.default.addObserver(self, selector: #selector(refresh),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
        refresh()
    }

    @objc private func refresh() {
        let fresh = stickRows(SetupStatus.read())
        guard fresh != rows else { return }
        rows = fresh
        tableView.reloadData()
    }

    @objc private func closeTapped() { dismiss(animated: true) }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { rows.count }

    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        "If you want. A Safari extension cannot reach the YouTube or Instagram apps, so Kindgate only works where you use the sites in Safari. Deleting the apps and opening the sites from the Home Screen keeps it that way."
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "row", for: indexPath)
        configure(cell, with: rows[indexPath.row])
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        if let url = rows[indexPath.row].action { UIApplication.shared.open(url) }
    }
}

// MARK: - Licences

/// Notices for what ships in the bundle. The full OFL and MIT texts travel
/// with the extension (fonts/OFL.txt, lists/LICENSE) and its popup shows them
/// under About; here the MIT text is short enough to give in full.
private let licenceNotices = """
KINDGATE
Open source under the Mozilla Public License 2.0.
Licence: https://www.mozilla.org/MPL/2.0/
Source code: https://github.com/IlijaVorontsov/kindgate

TYPEFACES
Fraunces. Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)
Instrument Sans. Copyright 2022 The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans)
Both under the SIL Open Font License, Version 1.1: https://openfontlicense.org

READY-MADE PAUSE LISTS
Derived from StevenBlack/hosts (https://github.com/StevenBlack/hosts), under the MIT License:

Copyright © 2023 Steven Black

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The full text of every licence ships with the extension. In Safari, open Kindgate from the page menu and look under About, Open source licences.
"""

private final class LicencesViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Open source licences"
        view.backgroundColor = .systemGroupedBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self,
                                                            action: #selector(closeTapped))

        let text = UITextView()
        text.isEditable = false
        text.dataDetectorTypes = .link          // the addresses above become tappable
        text.backgroundColor = .clear
        text.font = .preferredFont(forTextStyle: .footnote)
        text.adjustsFontForContentSizeCategory = true
        text.textColor = .label
        text.textContainerInset = UIEdgeInsets(top: 16, left: 16, bottom: 24, right: 16)
        text.text = licenceNotices
        text.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(text)
        NSLayoutConstraint.activate([
            text.topAnchor.constraint(equalTo: view.topAnchor),
            text.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            text.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            text.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
        ])
    }

    @objc private func closeTapped() { dismiss(animated: true) }
}
