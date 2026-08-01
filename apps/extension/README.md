# Ctrl+Teach Tars Chrome extension

1. Start the Ctrl+Teach frontend and backend.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension`.
3. Sign in to Ctrl+Teach and enable Tars from the app toggle.
4. Approve the one-time extension microphone prompt.
5. In any normal web page, hold **Control** to talk and release it to send the current tab context.

The extension captures only the active visible tab when a spoken turn ends. It does not use continuous screen sharing. Chrome internal pages, the Web Store, the address bar, and the tab strip cannot host content-script overlays.

Tars keeps one top-level overlay while relaying trusted pointer and Control-key input through embedded frames. This allows the cursor and push-to-talk interaction to continue inside iframe-based consoles such as AWS EC2 without duplicating the assistant.

Visual coordinate clicks use Chrome's debugger input channel so an explicitly requested click can reach canvas, video, image, and cross-origin iframe content. The extension attaches only for the individual click and immediately detaches. It rejects inactive tabs, changed pages, moved viewports, and screenshots older than 30 seconds; sensitive actions still require confirmation.

For a deployed Ctrl+Teach origin, add its exact origin to `CTRLTEACH_ORIGINS` in `service-worker.js` and `content.js` before packaging the extension.
