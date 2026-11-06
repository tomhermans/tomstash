# Tomstash

A Chrome extension that saves the page you're reading to **your own database**, together with a clean Markdown copy of the article, a short description written by Chrome's on-device AI, and tags picked from your own vocabulary.

Think Pocket or Instapaper, except you own the data, there is no subscription, and nothing is sent anywhere you didn't choose.

- No build step, no npm dependencies in the extension. Plain JavaScript ES modules.
- The two libraries it needs are vendored in `vendor/`.
- Works with any server that accepts a small JSON `POST` (see [The API contract](#the-api-contract)).

## Why use it

- **You own it.** Links, text and tags live in a database you control. Export, query, back up or migrate them whenever you like. There is no service to shut down or change its pricing.
- **Link-rot proof.** The readable article is saved as Markdown with the link, so you still have the text when the page disappears or goes behind a paywall.
- **Searchable and LLM-ready.** Clean Markdown, language, author, reading time and a lead image are stored per link. Full-text search, your own reader view, or feeding your archive to a model later are all easy.
- **Private by default.** Text extraction and the AI features run locally in your browser. The page text goes to your server only if you tick "Save page content". There is no analytics and no third-party service.
- **Fast capture.** One shortcut (`Cmd/Ctrl+Shift+S`) opens the popup. Page extraction starts as soon as it opens, so it's done by the time you've typed your tags.
- **Write less by hand.**
  - **TL;DR / Teaser / Custom** buttons draft the description. Custom uses a prompt you can edit, and the default writes a short intro in the article's own voice.
  - **Suggest tags** chooses from **your** tag list, so your tags stay consistent. It never invents new ones.
- **Doesn't get in the way.** If extraction or AI fails, or isn't available on your machine, the link still saves.
- **Small and hackable.** A few hundred lines you can read in an evening.

## Requirements

- Chrome (desktop). The extension itself works on any recent Chrome.
- **For the AI buttons:** Chrome 138 or newer, with its built-in Gemini Nano model available. The first use downloads the model, which needs a good amount of free disk space. Chrome's requirements for this change over time, so check `chrome://on-device-internals`. If the model isn't available the AI buttons stay hidden and everything else works.
- AI output is English only for now.
- A server that accepts the API below (a reference one is in `server/`).

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. Pin **Tomstash** to the toolbar.
5. Open the extension's **Options**:
   - **API Endpoint URL**: your server's base URL, without a trailing slash.
   - **API Key**: the shared secret your server expects.
   - **Custom description prompt**: optional, see below.

Settings are stored in `chrome.storage.sync` and never end up in the repository.

## Use

1. Open an article and click the icon (or press the shortcut, `Cmd/Ctrl+Shift+S` by default; see [Troubleshooting](#troubleshooting) if another extension has it).
2. The status line shows `Fetched N words, lang: xx` when extraction is done.
3. Edit the title. Optionally click **TL;DR**, **Teaser** or **Custom** to draft a description, and **Suggest tags** to add tags.
4. Untick **Save page content** if you only want the link.
5. Click **Save**.

On `chrome://` pages, the Chrome Web Store and PDFs there is nothing to extract, so the link saves without content.

## Make it yours

**Tags.** Open `tags.js`:

- `TAG_VOCAB` is the list the model may choose from. Replace it with your own tags.
- `TAG_ALIASES` maps variants to your canonical tag (`"wp": "wordpress"`). It's used when matching suggestions against tags you already typed.

Keep the list to a few dozen tags. The on-device model has a small context window, and a long list makes the suggestions worse. A good way to build the list is to count the tags you already use and merge the near-duplicates.

**Description prompt.** In the options page, edit **Custom description prompt**. The article title and text are sent after it. Clear the box and save to restore the default (`defaults.js`).

**Other knobs** are constants near the top of `popup.js`: `MAX_CONTENT_CHARS` and the input limits for the AI features.

## The API contract

The extension sends one request on save:

```
POST {endpoint}/api/links/index.json
Content-Type: application/json
X-API-Key: <your key>
```

```json
{
  "url": "https://example.com/post",
  "title": "Page title",
  "description": "Short text or null",
  "tags": ["css", "design"],
  "category": "articles",
  "favicon_url": "https://example.com/favicon.ico",
  "content_md": "# Markdown of the article, capped at 500,000 characters, or null",
  "author": "Byline or null",
  "image_url": "Open Graph image or null",
  "reading_time": 7,
  "lang": "en",
  "...": "null for any field that wasn't found"
}
```

It treats the save as successful when the response is OK and the JSON body has a `data` property. Otherwise it shows the `error` string from the body.

Your server must:

- check `X-API-Key`,
- answer the CORS preflight (`OPTIONS`) and send `Access-Control-Allow-Origin` plus `Access-Control-Allow-Headers: Content-Type, X-API-Key`.

That's all. The extension needs no host permissions, because it relies on CORS.

### Reference server

`server/` has two Astro API routes (`index.json.ts`, `[id].json.ts`) backed by Supabase, a full `schema.sql`, and `migration-add-content-columns.sql` for a table from before the content fields existed.

- They expect `API_KEY`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment variables.
- They import a Supabase client from `@lib/services/supabase`, which you provide in your own project.
- The list endpoint leaves out `content_md` on purpose. Fetch one link by id to get the full text.
- Review your Supabase row-level security settings for your setup. The routes use the anon key.

## Other databases

The extension only speaks the contract above, so any backend that implements it works. These are the ones I'd look at to make setup easier. None are built into this repository yet.

| Backend | How it would connect | Watch out for |
| --- | --- | --- |
| **Supabase, directly** | `POST` to the project's REST endpoint (`/rest/v1/links`) with the anon key. No server code. | Needs an insert-only row-level security policy. The key sits in the extension's storage, so use it only for yourself. |
| **Google Sheets** | A short Apps Script web app that appends a row. | A cell holds at most 50,000 characters, so long articles must be truncated. Apps Script web apps don't answer CORS preflights well, so the request would be sent as `text/plain`. |
| **Airtable** | Airtable's REST API with a personal access token. | Long-text fields have a size limit. Check it against long articles. |
| **Webhook (Make, Zapier, n8n)** | Point the endpoint at a webhook that writes wherever you like. | The extension expects a `{ "data": ... }` response. |

The cleanest way to support these would be a "backend" setting plus one small adapter per backend (build the request, check the response) in a single `backends.js`.

## Privacy and permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Read the current tab's URL and title when you open the popup. |
| `scripting` | Inject the readability script into the current page to extract the article. |
| `storage` | Keep your endpoint, key and custom prompt. |

Nothing is sent to your server until you click Save. The AI features run in the browser on Chrome's built-in model.

## Limitations

- Pages rendered after load, or hidden behind a login or paywall, may extract poorly or not at all.
- Content is capped at 500,000 characters and the AI features only read the start of long articles.
- Summaries and tag suggestions are only as good as a small local model. Edit them before saving.
- Existing links saved before you added content stay without content unless you backfill them.

## Troubleshooting

- **"Network error" / "Failed to fetch"**: the endpoint is wrong, or the server doesn't send CORS headers. Check the Network tab in the popup's DevTools (right-click the popup, then Inspect).
- **401 Unauthorized**: the key in Options differs from the server's `API_KEY`.
- **Saved but no content**: your server ignores `content_md`. Check that the route reads the field and that the column exists.
- **AI buttons missing**: open the popup's DevTools console and run `await Summarizer.availability()` and `await LanguageModel.availability()`. `unavailable` means this Chrome or machine doesn't support the model.
- **The shortcut opens a different extension**: two extensions can't share a shortcut, and the manifest value is only a suggestion. Open `chrome://extensions/shortcuts` and set your own for this extension (and clear the other one if you like).
- **After editing files**: click the reload icon on the extension's card in `chrome://extensions`.

## Credits

- [Mozilla Readability](https://github.com/mozilla/readability) (Apache-2.0) extracts the article.
- [Turndown](https://github.com/mixmark-io/turndown) (MIT) converts it to Markdown.

## License

MIT. See `LICENSE`. The vendored libraries keep their own licenses, see `vendor/`.
