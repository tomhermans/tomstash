// options.js
import { DEFAULT_CUSTOM_PROMPT } from "./defaults.js";

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("settings-form");
  const endpointInput = document.getElementById("api-endpoint");
  const apiKeyInput = document.getElementById("api-key");
  const status = document.getElementById("status");
  const promptInput = document.getElementById("custom-prompt");

  // Load saved settings
  const settings = await chrome.storage.sync.get(["apiKey", "apiEndpoint", "customPrompt"]);
  if (settings.apiEndpoint) endpointInput.value = settings.apiEndpoint;
  if (settings.apiKey) apiKeyInput.value = settings.apiKey;
  promptInput.value = settings.customPrompt || DEFAULT_CUSTOM_PROMPT;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const apiEndpoint = endpointInput.value.replace(/\/+$/, "");
    const apiKey = apiKeyInput.value.trim();

    const customPrompt = promptInput.value.trim();
    await chrome.storage.sync.set({ apiKey, apiEndpoint, customPrompt });
    if (!customPrompt) promptInput.value = DEFAULT_CUSTOM_PROMPT;

    status.textContent = "Settings saved.";
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  });
});
