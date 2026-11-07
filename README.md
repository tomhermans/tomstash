# Tomstash

A Chrome extension that saves the page you're reading to **your own database**, together with a clean Markdown copy of the article, a short description written by Chrome's on-device AI, and tags picked from your own vocabulary.

Think Pocket or Instapaper, except you own the data, there is no subscription, and nothing is sent anywhere you didn't choose.

- No build step, no npm dependencies in the extension. Plain JavaScript ES modules.
- The two libraries it needs are vendored in `vendor/`.
- Saves to **Supabase**, **Airtable**, **Google Sheets**, or your own server. See [Choose where links go](#choose-where-links-go).

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
- A place to save to: a free Supabase project, an Airtable base, a Google Sheet, or your own server.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. Pin **Tomstash** to the toolbar.
5. Open the extension's **Options**, pick where links should be saved, fill in the fields and click **Test connection**, then **Save Settings**. The setup steps are listed below.
6. Optional: set your own **Custom description prompt** in the same page.

Settings, including keys and tokens, are stored in `chrome.storage.sync` in your browser profile and never end up in the repository.

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

## Choose where links go

Pick a backend in the options page. All four receive the same data: URL, title, description, tags, category, favicon, lead image, author, reading time, language and the article as Markdown (`content_md`).

| Backend | Setup effort | Best for | Content size limit |
| --- | --- | --- | --- |
| [Supabase](#supabase) | Medium | A real database you can query and build a reading site on | None practical |
| [Airtable](#airtable) | Low | A friendly table UI, no code | 100,000 characters (trimmed automatically) |
| [Google Sheets](#google-sheets) | Low | The simplest option, nothing to sign up for | 49,000 characters per cell (trimmed automatically) |
| [Custom API](#custom-api) | Highest | Your own site or server | Yours |

> The Airtable adapter has been tried against a real base. The Supabase and Google Sheets adapters are written from each service's documentation and have not been tried against real accounts yet. Use **Test connection** and save a page to check your setup, and please report what breaks.

### Switching between backends

Each backend keeps its own saved settings, so you can try another one and switch back without retyping anything.

- Picking a different backend in the dropdown changes nothing until you click **Save Settings**. **Test connection** works on unsaved values, so you can try a service first.
- Switching the dropdown discards edits you haven't saved. Each backend shows its last saved values.
- Links don't move between backends. Each service only holds what was saved while it was active.

The first time you save settings for Supabase, Airtable or Google Sheets, Chrome asks to let the extension talk to that service. This is the extension's optional host permission, and it is only requested for the backend you pick. Without it the extension falls back to normal CORS, which may or may not work.

### Supabase

The extension posts straight to your project's REST API. No server code.

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor run `server/schema.sql`, then `integrations/supabase-rls.sql`. The second one lets the anon key insert rows but not read, change or delete them.
3. In **Project Settings > API** copy the **Project URL** and the **anon public** key.
4. In the extension's options choose **Supabase**, paste both, keep the table name `links` and click **Test connection**.

Notes:

- Keep the anon key out of any browser you don't trust. It lives in `chrome.storage.sync`.
- With this policy anyone who finds the anon key can add rows, but cannot read your data. Rotate the key if it leaks.
- If you already have a `links` table from the reference server, use `server/migration-add-content-columns.sql` to add the content columns.
- Reading your links back (for a reading page) needs either a server or a different policy. See `server/` for an example server.

### Airtable

1. Create a blank base at [airtable.com](https://airtable.com). Airtable's API can't do this step for you.
2. Create a token at [airtable.com/create/tokens](https://airtable.com/create/tokens), limited to that base, with the scopes `data.records:read` and `data.records:write`. If you want the script in step 4, also add `schema.bases:write` (and you must be the base's creator). Remove the schema scopes once the table exists. Never paste a token into a command line or a chat: it ends up in your shell history. The script reads it from an environment variable instead.
3. Copy the base ID (it starts with `app`) from the base's URL.
4. Create the table with its columns, either way:

   **With the script** (about a minute, run from the repository folder). It creates a `Links` table with every column below, using the right field types:

   ```bash
   read -s AIRTABLE_TOKEN && export AIRTABLE_TOKEN
   export AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
   integrations/airtable-create-table.sh
   ```

   The response is JSON describing the new table. An error message from Airtable means something is wrong with the token's scopes or the base ID. The table name and columns come from `integrations/airtable-table.json`, which you can edit first. Delete the base's default "Table 1" afterwards if you like.

   **Or by hand**: add these fields to a table. Names are case-sensitive:

   | Field | Type |
   | --- | --- |
   | `title` | Single line text (the primary field) |
   | `url`, `category`, `author`, `lang`, `favicon_url`, `image_url`, `tags` | Single line text (tags are comma-separated) |
   | `description`, `content_md` | Long text |
   | `reading_time` | Number (integer) |
   | `created_at`, `content_fetched_at` | Date with time (or single line text). Not "Created time", which Airtable fills in itself and refuses to accept values for |
   | `is_read`, `is_archived` | Checkbox (optional, the extension doesn't send them) |

5. In the extension's options choose **Airtable**, paste the token, base ID and table name, and click **Test connection**.

These names match the Supabase schema in `server/schema.sql`, so you can create the table by importing a CSV exported from there. Columns that the extension doesn't send (such as `id`, `is_read`, `is_archived`) can stay.

The request uses Airtable's `typecast` option, so a field imported from a CSV as text still accepts the number in `reading_time`. Use a Number field if you want to sort or filter on it.

Fields that are empty on a page are left out of the request, so a missing field on a page never causes an error. A field *name* that doesn't exist in your table does, and Airtable names it in the error.

### Google Sheets

This uses a small Apps Script as a web endpoint, so there is no Google sign-in and no OAuth setup.

1. Create a Google Sheet.
2. Open **Extensions > Apps Script**, delete the sample code and paste in `integrations/google-apps-script.gs`.
3. Optional but recommended: set `SECRET` at the top to a random string.
4. Click **Deploy > New deployment**, choose **Web app**, set **Execute as: Me** and **Who has access: Anyone**, and deploy. Approve the permission prompt.
5. Copy the **Web app URL**.
6. In the extension's options choose **Google Sheets**, paste the URL (and the secret if you set one) and click **Test connection**.

**Where your links end up.** On the first save the script creates a new tab called **`Links`** at the bottom of the spreadsheet, with a header row. Each save appends a row to it. Your first blank tab (`Sheet1`) stays empty, and **Test connection** doesn't add a row, so look in the `Links` tab. If you can't see the tab bar, use the **All sheets** menu at the bottom-left.

**Using a different tab (such as `Sheet1`).** The tab name is set by this line near the top of the script:

```js
const SHEET_NAME = "Links";
```

Change `"Links"` to the name of any existing tab, for example `"Sheet1"`, then deploy a **new version** (**Deploy > Manage deployments**, pencil icon, **Version: New version**, **Deploy**). The web app URL stays the same. If that tab is empty, the script writes the header row on the next save. If it already has data, new rows are added below it, so the columns must match the script's `COLUMNS` list.

Notes:

- "Anyone" means anyone who has the URL can append rows. The URL is long and unguessable, and the optional secret adds a second check. It still isn't real authentication.
- After you edit the script, deploy a **new version** for the change to go live.
- Each cell holds at most 50,000 characters, so long articles are cut at 49,000.

### Custom API

Point the extension at your own server. It sends one request on save:

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
  "lang": "en"
}
```

Any field the extension couldn't find is `null`. A save counts as successful when the response is OK and the JSON body has a `data` property. Otherwise the extension shows the body's `error` string.

Your server must check `X-API-Key`, answer the CORS preflight (`OPTIONS`), and send `Access-Control-Allow-Origin` and `Access-Control-Allow-Headers: Content-Type, X-API-Key`.

**Test connection** sends `GET {endpoint}/api/links/index.json?limit=1` with the key and expects a 200.

#### Reference server

`server/` has two Astro API routes (`index.json.ts`, `[id].json.ts`) backed by Supabase, a full `schema.sql`, and `migration-add-content-columns.sql` for a table from before the content fields existed.

- They expect `API_KEY`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment variables.
- They import a Supabase client from `@lib/services/supabase`, which you provide in your own project.
- The list endpoint leaves out `content_md` on purpose. Fetch one link by id to get the full text.
- Review your Supabase row-level security settings for your setup. The routes use the anon key.

### Adding another backend

Each backend is a small object in `backends.js` with a label, setup steps, the fields to ask for, `origins` (hosts to request access to), `save(config, payload)` and `test(config)`. Add one to `BACKENDS` and it appears in the options page. A webhook for Make, Zapier or n8n would be about twenty lines.

## Privacy and permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Read the current tab's URL and title when you open the popup. |
| `scripting` | Inject the readability script into the current page to extract the article. |
| `storage` | Keep your backend settings and custom prompt. |
| Optional host access | Asked for only when you save settings for Supabase, Airtable or Google Sheets, limited to that service. |

Nothing is sent to your backend until you click Save. The AI features run in the browser on Chrome's built-in model.

## Limitations

- Pages rendered after load, or hidden behind a login or paywall, may extract poorly or not at all.
- Content is capped at 500,000 characters and the AI features only read the start of long articles.
- Summaries and tag suggestions are only as good as a small local model. Edit them before saving.
- Existing links saved before you added content stay without content unless you backfill them.

## Troubleshooting

- **"Network error" / "Failed to fetch"**: the URL is wrong, or (Custom API) the server doesn't send CORS headers. If you denied the permission prompt, save the settings again and allow it. Check the Network tab in the popup's DevTools (right-click the popup, then Inspect).
- **401 Unauthorized / 403**: the key, token or secret is wrong. For Supabase a message about row-level security means `integrations/supabase-rls.sql` hasn't been run. For Airtable, check the token's scopes and base.
- **Airtable `INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND`** (from the script): the token is missing `schema.bases:write`, isn't allowed to access that base, or you aren't the base's creator. The base ID can also be wrong.
- **Airtable `Unknown field name: "x"`**: the table has no field called `x`. Names are case-sensitive.
- **Airtable `Cannot parse value`** or a message about a computed field: a field has the wrong type, for example "Created time" on `created_at`. Change it to Date with time.
- **Saved but no content**: your backend ignores `content_md`. Check that the column or field exists (and for a custom server, that the route reads it).
- **Google Sheets says "Unexpected response"**: the script isn't deployed as a web app with access set to Anyone, or you edited it without deploying a new version.
- **AI buttons missing**: open the popup's DevTools console and run `await Summarizer.availability()` and `await LanguageModel.availability()`. `unavailable` means this Chrome or machine doesn't support the model.
- **The shortcut opens a different extension**: two extensions can't share a shortcut, and the manifest value is only a suggestion. Open `chrome://extensions/shortcuts` and set your own for this extension (and clear the other one if you like).
- **After editing files**: click the reload icon on the extension's card in `chrome://extensions`.

## Credits

- [Mozilla Readability](https://github.com/mozilla/readability) (Apache-2.0) extracts the article.
- [Turndown](https://github.com/mixmark-io/turndown) (MIT) converts it to Markdown.

## License

MIT. See `LICENSE`. The vendored libraries keep their own licenses, see `vendor/`.
