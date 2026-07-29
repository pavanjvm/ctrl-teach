# Ctrl+Teach Tars Chrome extension

1. Start the Ctrl+Teach frontend and backend.
2. Copy `apps/extension/.env.example` to `apps/extension/.env` and set `CTRLTEACH_FRONTEND_URL` to the exact frontend origin printed by `npm run dev`.
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension`.
4. Sign in to Ctrl+Teach and enable Tars from the app toggle.
5. Approve the one-time extension microphone prompt.
6. In any normal web page, hold **Control** to talk and release it to send the current tab context.

After changing `apps/extension/.env` or extension code, click **Reload** for Ctrl+Teach Tars on `chrome://extensions`, then reload open web tabs.

The extension captures only the active visible tab when a spoken turn ends. It does not use continuous screen sharing. Chrome internal pages, the Web Store, the address bar, and the tab strip cannot host content-script overlays.

Tars keeps one top-level overlay while relaying trusted pointer and Control-key input through embedded frames. This allows the cursor and push-to-talk interaction to continue inside iframe-based consoles such as AWS EC2 without duplicating the assistant.

For a deployed Ctrl+Teach app, set `CTRLTEACH_FRONTEND_URL` to its public origin before packaging. API and WebSocket addresses continue to come from the frontend environment through the authenticated bridge.
