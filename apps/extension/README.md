# Ctrl+Teach Tars Chrome extension

1. Start the Ctrl+Teach frontend and backend.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension`.
3. Sign in to Ctrl+Teach and enable Tars from the app toggle.
4. Approve the one-time extension microphone prompt.
5. In any normal web page, hold **Control** to talk and release it to send the current tab context.

The extension captures only the active visible tab when a spoken turn ends. It does not use continuous screen sharing. Chrome internal pages, the Web Store, the address bar, and the tab strip cannot host content-script overlays.

For a deployed Ctrl+Teach origin, add its exact origin to `CTRLTEACH_ORIGINS` in `service-worker.js` and `content.js` before packaging the extension.
