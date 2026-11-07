// popup.js
import TurndownService from "./vendor/turndown.browser.es.js";
import { TAG_VOCAB, TAG_ALIASES } from "./tags.js";
import { DEFAULT_CUSTOM_PROMPT } from "./defaults.js";
import { BACKENDS, isConfigured, loadSettings } from "./backends.js";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

const MAX_CONTENT_CHARS = 500_000;

const extractArticle = async (tabId) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["vendor/Readability.js"],
    });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const meta = (sel) => document.querySelector(sel)?.content || null;
        const article = new Readability(document.cloneNode(true)).parse();
        if (!article) return null;
        return {
          html: article.content,
          byline: article.byline,
          excerpt: article.excerpt,
          lang: article.lang,
          image: meta('meta[property="og:image"]'),
          words: article.textContent.trim().split(/\s+/).length,
        };
      },
    });
    return result;
  } catch {
    return null;
  }
};

const MAX_SUMMARY_INPUT_CHARS = 8000;
const MAX_PROMPT_INPUT_CHARS = 6000;

const articleText = (article) =>
  new DOMParser()
    .parseFromString(article.html, "text/html")
    .body.textContent.replace(/\s+/g, " ")
    .trim();

const generateWithSummarizer = async (type, text, onChunk, onProgress) => {
  const summarizer = await Summarizer.create({
    type,
    length: "short",
    format: "plain-text",
    outputLanguage: "en",
    sharedContext: "A web article saved to a personal bookmark library.",
    monitor: (m) =>
      m.addEventListener("downloadprogress", (e) => onProgress(e.loaded)),
  });
  try {
    const limit = Math.min(MAX_SUMMARY_INPUT_CHARS, (summarizer.inputQuota || Infinity) * 3);
    let summary = "";
    for await (const chunk of summarizer.summarizeStreaming(text.slice(0, limit))) {
      summary += chunk;
      onChunk(summary);
    }
  } finally {
    summarizer.destroy();
  }
};

const generateWithPrompt = async (prompt, text, onChunk, onProgress) => {
  const session = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: prompt }],
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    monitor: (m) =>
      m.addEventListener("downloadprogress", (e) => onProgress(e.loaded)),
  });
  try {
    let result = "";
    for await (const chunk of session.promptStreaming(text.slice(0, MAX_PROMPT_INPUT_CHARS))) {
      result += chunk;
      onChunk(result.trim());
    }
  } finally {
    session.destroy();
  }
};

const MAX_TAG_INPUT_CHARS = 4000;

const canonicalTag = (tag) => TAG_ALIASES[tag] || tag;

const suggestTags = async (text, onProgress) => {
  const session = await LanguageModel.create({
    initialPrompts: [
      {
        role: "system",
        content: `You tag saved web articles. Choose 3 to 5 tags that best describe the article, using only tags from this list: ${TAG_VOCAB.join(", ")}.`,
      },
    ],
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    monitor: (m) =>
      m.addEventListener("downloadprogress", (e) => onProgress(e.loaded)),
  });
  try {
    const answer = await session.prompt(
      `Article:\n${text.slice(0, MAX_TAG_INPUT_CHARS)}\n\nReply with only a comma-separated list of 3 to 5 tags from the allowed list.`,
    );
    const tags = answer
      .split(/[,\n]/)
      .map((t) => canonicalTag(t.toLowerCase().replace(/^[\s\-*\d.]+|["'\s]+$/g, "").trim()))
      .filter((t) => TAG_VOCAB.includes(t));
    return [...new Set(tags)].slice(0, 5);
  } finally {
    session.destroy();
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("save-form");
  const status = document.getElementById("status");
  const notConfigured = document.getElementById("not-configured");
  const saveBtn = document.getElementById("save-btn");
  const urlInput = document.getElementById("url");
  const titleInput = document.getElementById("title");

  // Check if settings are configured
  const settings = await loadSettings();

  if (!isConfigured(settings.backend, settings.config)) {
    form.hidden = true;
    notConfigured.hidden = false;

    document.getElementById("open-options").addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab) {
    urlInput.value = tab.url || "";
    titleInput.value = tab.title || "";
  }

  const articlePromise = tab ? extractArticle(tab.id) : Promise.resolve(null);

  const contentStatus = document.getElementById("content-status");
  contentStatus.textContent = "Fetching page content...";
  const generateBtns = [...document.querySelectorAll("#generate-row [data-kind]")];
  const descInput = document.getElementById("description");
  const suggestBtn = document.getElementById("suggest-tags");
  const tagsInput = document.getElementById("tags");

  const showButtons = (kinds) => {
    generateBtns.forEach((b) => {
      if (kinds.includes(b.dataset.kind)) b.hidden = false;
    });
  };

  articlePromise.then((a) => {
    contentStatus.textContent = a
      ? `Fetched ${a.words} words, lang: ${a.lang || "unknown"}`
      : "No content found";
    generateBtns.forEach((b) => {
      b.disabled = !a;
    });
    suggestBtn.disabled = !a;
  });

  if (typeof LanguageModel !== "undefined") {
    LanguageModel.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    })
      .then((state) => {
        if (state === "unavailable") return;
        suggestBtn.hidden = false;
        showButtons(["custom"]);
        if (state !== "available") {
          suggestBtn.textContent = "Suggest tags (downloads model)";
        }
      })
      .catch(() => {});
  }

  suggestBtn.addEventListener("click", async () => {
    const article = await articlePromise;
    if (!article) return;
    const previousStatus = contentStatus.textContent;
    suggestBtn.disabled = true;
    contentStatus.textContent = "Suggesting tags...";
    try {
      const suggestions = await suggestTags(
        `${titleInput.value}\n\n${articleText(article)}`,
        (loaded) => {
          contentStatus.textContent = `Downloading model ${Math.round(loaded * 100)}%`;
        },
      );
      const current = tagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const have = new Set(current.map((t) => canonicalTag(t.toLowerCase())));
      const added = suggestions.filter((t) => !have.has(t));
      tagsInput.value = [...current, ...added].join(", ");
      contentStatus.textContent = added.length
        ? `Suggested Tags: ${added.join(", ")}`
        : "No new tags suggested";
    } catch (err) {
      contentStatus.textContent = `Could not suggest tags (${err?.name}: ${err?.message})`;
    }
    suggestBtn.disabled = false;
  });

  if (typeof Summarizer !== "undefined") {
    Summarizer.availability()
      .then((state) => {
        if (state !== "unavailable") showButtons(["tldr", "teaser"]);
      })
      .catch(() => {});
  }

  generateBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (descInput.value.trim() && !confirm("Replace the current description?")) return;
      const article = await articlePromise;
      if (!article) return;
      const kind = btn.dataset.kind;
      const previous = descInput.value;
      const previousStatus = contentStatus.textContent;
      generateBtns.forEach((b) => {
        b.disabled = true;
      });
      const onChunk = (text) => {
        descInput.value = text;
        contentStatus.textContent = previousStatus;
      };
      const onProgress = (loaded) => {
        contentStatus.textContent = `Downloading model ${Math.round(loaded * 100)}%`;
      };
      try {
        if (kind === "custom") {
          await generateWithPrompt(
            settings.customPrompt?.trim() || DEFAULT_CUSTOM_PROMPT,
            `${titleInput.value}\n\n${articleText(article)}`,
            onChunk,
            onProgress,
          );
        } else {
          await generateWithSummarizer(kind, articleText(article), onChunk, onProgress);
        }
      } catch (err) {
        descInput.value = previous;
        contentStatus.textContent = `Could not generate a description (${err?.name}: ${err?.message})`;
      }
      generateBtns.forEach((b) => {
        b.disabled = false;
      });
    });
  });

  // Handle form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    showStatus("", "");

    const tagsRaw = document.getElementById("tags").value;
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const wantContent = document.getElementById("save-content").checked;
    const article = wantContent ? await articlePromise : null;

    const payload = {
      url: urlInput.value,
      title: titleInput.value,
      description: document.getElementById("description").value || article?.excerpt || null,
      tags,
      category: document.getElementById("category").value || null,
      favicon_url: tab?.favIconUrl || null,
      content_md: article ? turndown.turndown(article.html).slice(0, MAX_CONTENT_CHARS) : null,
      author: article?.byline || null,
      image_url: article?.image || null,
      reading_time: article ? Math.max(1, Math.round(article.words / 220)) : null,
      lang: article?.lang || null,
    };

    try {
      await BACKENDS[settings.backend].save(settings.config, payload);
      showStatus("Saved!", "success");
      saveBtn.textContent = "Saved!";
      setTimeout(() => window.close(), 1200);
    } catch (err) {
      showStatus(err.message || "Failed to save", "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });

  function showStatus(message, type) {
    if (!message) {
      status.hidden = true;
      return;
    }
    status.textContent = message;
    status.className = type;
    status.hidden = false;
  }
});
