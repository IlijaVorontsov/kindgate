- The README now says that the copy of the feature switches kept in YouTube's
  and Instagram's own storage can be read by those sites and stays after
  Kindgate is removed, and that the app is told which sites you granted the
  extension. Neither leaves the device; both were undocumented.
- Why Kindgate asks for the `nativeMessaging` permission: the extension uses it
  only to tell its own app, on the device, that it is switched on and which
  sites it may run on, so the app's setup checklist can show that. It reaches
  no other app and no server.
