//
//  SafariWebExtensionHandler.swift
//  Kindgate Extension
//
//  Receives browser.runtime.sendNativeMessage() from background.js and keeps
//  a small status dictionary in the App Group so the container app's setup
//  checklist can show live state. Two message types:
//
//    { type: "alive", at: <ms>, origins: [...] }            the extension is on
//    { type: "seen", host, standalone: Bool, at: <ms> }     a site was allowed
//
//  Stored under "kgStatus":
//    { alive: ms, origins: [...], hosts: { host: ms }, standalone: { host: ms } }
//
//  This file lives in the repo under app/ and is copied over the converter's
//  file by build.sh.
//

import SafariServices
import os.log

private let appGroup = "group.app.kindgate"
private let statusKey = "kgStatus"

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        var ok = false
        if let dict = message as? [String: Any] {
            ok = record(dict)
        }
        if !ok {
            os_log(.default, "Kindgate: ignored native message %@", String(describing: message))
        }

        let response = NSExtensionItem()
        let body: [String: Any] = ["ok": ok]
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: body]
        } else {
            response.userInfo = ["message": body]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    /// Merges one message into the shared status dictionary. Returns false for
    /// anything that is not a well-formed status message.
    private func record(_ msg: [String: Any]) -> Bool {
        guard let type = msg["type"] as? String,
              let defaults = UserDefaults(suiteName: appGroup) else { return false }

        var status = defaults.dictionary(forKey: statusKey) ?? [:]
        let at = (msg["at"] as? NSNumber)?.doubleValue ?? (Date().timeIntervalSince1970 * 1000)

        switch type {
        case "alive":
            status["alive"] = at
            if let origins = msg["origins"] as? [String] {
                status["origins"] = origins
            }
        case "seen":
            guard let host = msg["host"] as? String, !host.isEmpty else { return false }
            var hosts = status["hosts"] as? [String: Any] ?? [:]
            hosts[host] = at
            status["hosts"] = hosts
            if (msg["standalone"] as? Bool) == true {
                var standalone = status["standalone"] as? [String: Any] ?? [:]
                standalone[host] = at
                status["standalone"] = standalone
            }
            // A site can only be seen while the extension is on.
            status["alive"] = at
        default:
            return false
        }

        defaults.set(status, forKey: statusKey)
        return true
    }
}
