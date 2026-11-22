- `bash build.sh --mac` builds without a signing certificate (signed to run
  locally; Safari then needs *Allow unsigned extensions*), and `--no-install`
  builds without copying the app to `~/Applications`.
- `bash build.sh --simulator` compiles the iPhone app for the iOS Simulator
  with no device or Apple ID.
