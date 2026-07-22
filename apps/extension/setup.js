const button = document.getElementById("enable");
const status = document.getElementById("status");

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Waiting for Chrome permission…";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    await chrome.runtime.sendMessage({ type: "TARS_MIC_GRANTED" });
    status.textContent = "Microphone enabled. You can close this tab.";
  } catch {
    status.textContent = "Permission was not granted. Allow microphone access and try again.";
    button.disabled = false;
  }
});
