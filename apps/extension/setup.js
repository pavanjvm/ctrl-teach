const button = document.getElementById("enable");
const saveOriginButton = document.getElementById("save-origin");
const appOriginInput = document.getElementById("app-origin");
const status = document.getElementById("status");

async function loadSetupStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "TARS_SETUP_STATUS" });
    if (!response?.ok) return;
    appOriginInput.value = response.configuredAppOrigin || "";
    if (response.enabled) status.textContent = "Tars is connected to Ctrl+Teach.";
  } catch {
    status.textContent = "Reload the extension and try again.";
  }
}

saveOriginButton.addEventListener("click", async () => {
  saveOriginButton.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "TARS_SET_APP_ORIGIN",
      appUrl: appOriginInput.value.trim(),
    });
    if (response?.ok) {
      appOriginInput.value = response.configuredAppOrigin || "";
      status.textContent = response.configuredAppOrigin
        ? `Saved ${response.configuredAppOrigin}. Return to that app and enable Tars.`
        : "Saved. Local development origins remain available automatically.";
    } else {
      status.textContent = "Enter a valid http or https app address.";
    }
  } catch {
    status.textContent = "Reload the extension and try again.";
  } finally {
    saveOriginButton.disabled = false;
  }
});

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
