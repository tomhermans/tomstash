// options.js
import { BACKENDS, loadSettings, requestAccess } from "./backends.js";
import { DEFAULT_CUSTOM_PROMPT } from "./defaults.js";

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("settings-form");
  const backendSelect = document.getElementById("backend");
  const stepsList = document.getElementById("steps");
  const fieldsBox = document.getElementById("backend-fields");
  const promptInput = document.getElementById("custom-prompt");
  const testBtn = document.getElementById("test-btn");
  const status = document.getElementById("status");

  const settings = await loadSettings();

  const showStatus = (message, type = "") => {
    status.textContent = message;
    status.className = type;
  };

  const renderBackend = (id) => {
    const backend = BACKENDS[id];
    const values = settings.configs[id] || {};
    stepsList.replaceChildren(
      ...backend.steps.map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      }),
    );
    fieldsBox.replaceChildren(
      ...backend.fields.map((f) => {
        const wrap = document.createElement("div");
        wrap.className = "field";
        const label = document.createElement("label");
        label.htmlFor = `f-${f.key}`;
        label.textContent = f.label;
        const input = document.createElement("input");
        input.id = `f-${f.key}`;
        input.type = f.type;
        input.placeholder = f.placeholder || "";
        input.required = Boolean(f.required);
        input.value = values[f.key] ?? f.default ?? "";
        wrap.append(label, input);
        if (f.help) {
          const help = document.createElement("p");
          help.className = "help";
          help.textContent = f.help;
          wrap.append(help);
        }
        return wrap;
      }),
    );
  };

  const readValues = (id) =>
    Object.fromEntries(
      BACKENDS[id].fields.map((f) => [f.key, document.getElementById(`f-${f.key}`).value.trim()]),
    );

  backendSelect.replaceChildren(
    ...Object.entries(BACKENDS).map(([id, b]) => new Option(b.label, id)),
  );
  backendSelect.value = settings.backend;
  renderBackend(settings.backend);
  promptInput.value = settings.customPrompt || DEFAULT_CUSTOM_PROMPT;

  backendSelect.addEventListener("change", () => {
    showStatus("");
    renderBackend(backendSelect.value);
  });

  testBtn.addEventListener("click", async () => {
    if (!form.reportValidity()) return;
    const id = backendSelect.value;
    const values = readValues(id);
    testBtn.disabled = true;
    showStatus("Testing...");
    await requestAccess(id, values);
    try {
      await BACKENDS[id].test(values);
      showStatus("Connection OK.");
    } catch (err) {
      showStatus(err.message || "Connection failed", "error");
    }
    testBtn.disabled = false;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = backendSelect.value;
    const values = readValues(id);
    await requestAccess(id, values);

    const customPrompt = promptInput.value.trim();
    const next = { backend: id, customPrompt };
    if (id === "api") {
      next.apiEndpoint = values.apiEndpoint.replace(/\/+$/, "");
      next.apiKey = values.apiKey;
    } else {
      const { api, ...others } = settings.configs;
      next.config = { ...others, [id]: values };
    }
    await chrome.storage.sync.set(next);
    settings.configs = {
      ...settings.configs,
      [id]: id === "api" ? { apiEndpoint: next.apiEndpoint, apiKey: next.apiKey } : values,
    };
    if (!customPrompt) promptInput.value = DEFAULT_CUSTOM_PROMPT;

    showStatus("Settings saved.");
    setTimeout(() => showStatus(""), 2000);
  });
});
