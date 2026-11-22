//
//  AppDelegate.swift
//  Kindgate (Mac)
//
//  The Mac app is one window (ViewController.swift). Closing it quits the app:
//  Kindgate does its work inside Safari, not here.
//
//  This file lives in the repo under app-mac/ and is copied over the
//  packager's file by build.sh --mac.
//

import Cocoa

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        true
    }

    /// Help › Kindgate Support. The app has no help book; the support page is the help.
    @IBAction func openSupport(_ sender: Any?) {
        if let url = URL(string: "https://kindgate.app/support") {
            NSWorkspace.shared.open(url)
        }
    }
}
