const button = document.getElementById("enable");
const status = document.getElementById("status");

async function loadSetupStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "TARS_SETUP_STATUS" });
    if (!response?.ok) return;
    if (!response.configuredFrontendOrigin) {
      status.textContent = "Set CTRLTEACH_FRONTEND_URL in apps/extension/.env, then reload the extension.";
    } else if (response.enabled) {
      status.textContent = `Tars is connected to ${response.configuredFrontendOrigin}.`;
    } else {
      status.textContent = `Frontend configured: ${response.configuredFrontendOrigin}.`;
    }
  } catch {
    status.textContent = "Reload the extension and try again.";
  }
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Waiting for Chrome permission…";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    await chrome.runtime.sendMessage({ type: "TARS_MIC_GRANTED" });
    status.textContent = "Microphone enabled. Return to Ctrl+Teach, enable Tars, then hold Control in any regular web tab.";
  } catch {
    status.textContent = "Permission was not granted. Allow microphone access and try again.";
    button.disabled = false;
  }
});

void loadSetupStatus();
