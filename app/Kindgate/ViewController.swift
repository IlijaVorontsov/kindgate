//
//  ViewController.swift
//  Kindgate
//
//  The setup checklist. Every row shows live status:
//    - the extension and the allowed sites come from timestamps the extension
//      writes into the App Group (see background.js and
//      SafariWebExtensionHandler.swift) — iOS offers no API for either;
//    - "app deleted" comes from canOpenURL on the apps' URL schemes
//      (LSApplicationQueriesSchemes is set by build.sh);
//    - "on the Home Screen" comes from navigator.standalone, reported by the
//      content script when the page was opened from the Home Screen.
//
//  This file lives in the repo under app/ and is copied over the converter's
//  file by build.sh. It is deliberately a single file with no storyboard
//  outlets so the generated project needs no new file references.
//

import UIKit

private let appGroup = "group.app.kindgate"
private let statusKey = "kgStatus"
private let staleAfter: TimeInterval = 7 * 24 * 3600

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
    let origins: [String]            // browser.permissions.getAll().origins, best effort
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
            origins: d["origins"] as? [String] ?? [],
            youtubeApp: installed("youtube"),
            instagramApp: installed("instagram"))
    }

    func originGranted(_ needle: String) -> Bool {
        origins.contains { $0.contains(needle) }
    }
}

// MARK: - Rows

private enum RowState { case done, todo, stale }

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
    func site(_ host: String, open: String) -> Row {
        let url = URL(string: open)
        if let seen = s.hosts[host] {
            return Row(title: "\(host) allowed", detail: "Seen \(ago(seen)).", state: .done, action: nil)
        }
        if s.originGranted(host) {
            return Row(title: "\(host) allowed", detail: "Allowed in Safari. Not opened yet.", state: .done, action: url)
        }
        return Row(title: "\(host) allowed",
                   detail: "Not seen yet. Tap to open \(host) in Safari, then choose Allow (Always Allow) when Safari asks.",
                   state: .todo, action: url)
    }
    let yt = site("youtube.com", open: "https://m.youtube.com/")
    let ig = site("instagram.com", open: "https://www.instagram.com/")

    // 4. Other Websites
    let otherRow: Row
    let anyPage = URL(string: "https://www.wikipedia.org/")
    if let seen = s.hosts["other"] {
        otherRow = Row(title: "Other Websites allowed", detail: "Seen \(ago(seen)).", state: .done, action: nil)
    } else if s.originGranted("<all_urls>") || s.originGranted("*://*/*") {
        otherRow = Row(title: "Other Websites allowed", detail: "Allowed in Safari.", state: .done, action: nil)
    } else {
        otherRow = Row(title: "Other Websites allowed",
                       detail: "Needed for the check-in, the pause screen and the night screen on every site. Tap to open a page, then under \(settingsPath) set Other Websites to Allow.",
                       state: .todo, action: anyPage)
    }

    // 5. Apps deleted, sites on the Home Screen
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

    return [
        Section(header: "Safari extension",
                footer: "Status comes from the extension itself and updates when you come back to this screen.",
                rows: [extRow, yt, ig, otherRow]),
        Section(header: "Make it stick",
                footer: "A Safari extension cannot reach the YouTube or Instagram apps. Deleting them and using the sites from the Home Screen is what makes Kindgate hold.",
                rows: [app("YouTube", installed: s.youtubeApp),
                       app("Instagram", installed: s.instagramApp),
                       home("youtube.com", open: "https://m.youtube.com/"),
                       home("instagram.com", open: "https://www.instagram.com/")]),
    ]
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
        sub.text = "Kindgate works inside Safari. Each step below turns green on its own once it is done."
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
        let row = sections[indexPath.section].rows[indexPath.row]
        let cell = tableView.dequeueReusableCell(withIdentifier: "row", for: indexPath)

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
        }
        content.imageProperties.preferredSymbolConfiguration = UIImage.SymbolConfiguration(textStyle: .title2)
        cell.contentConfiguration = content
        cell.accessoryType = row.action == nil ? .none : .disclosureIndicator
        cell.selectionStyle = row.action == nil ? .none : .default
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard let url = sections[indexPath.section].rows[indexPath.row].action else { return }
        UIApplication.shared.open(url)
    }
}
