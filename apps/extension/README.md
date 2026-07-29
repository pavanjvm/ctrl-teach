# Ctrl+Teach Tars Chrome extension

1. Start the Ctrl+Teach frontend and backend.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension`.
3. Sign in to Ctrl+Teach and enable Tars from the app toggle.
4. Approve the one-time extension microphone prompt.
5. In any normal web page, hold **Control** to talk and release it to send the current tab context.

Local Ctrl+Teach development accepts any port on `localhost`, `127.0.0.1`, or loopback IPv6. After changing extension code, click **Reload** for Ctrl+Teach Tars on `chrome://extensions`, then reload open web tabs.

The extension captures only the active visible tab when a spoken turn ends. It does not use continuous screen sharing. Chrome internal pages, the Web Store, the address bar, and the tab strip cannot host content-script overlays.

Tars keeps one top-level overlay while relaying trusted pointer and Control-key input through embedded frames. This allows the cursor and push-to-talk interaction to continue inside iframe-based consoles such as AWS EC2 without duplicating the assistant.

For a deployed Ctrl+Teach app, open the extension options page once and save its public app address. API and WebSocket addresses continue to come from the frontend environment through the authenticated bridge.
