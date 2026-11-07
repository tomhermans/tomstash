// Tomstash: save links to a Google Sheet.
//
// SETUP
//
// 1. Open (or create) the Google Sheet that should hold your links, at
//    https://sheets.google.com. The script must be opened from this sheet,
//    not from script.google.com, so that it is attached to the sheet.
//
// 2. In the sheet's menu bar (the row with File, Edit, View, Insert, Format,
//    Data, Tools, Extensions, Help) click "Extensions", then "Apps Script".
//    A new browser tab opens with the code editor and a file called Code.gs.
//
// 3. Select everything in Code.gs, delete it, and paste this whole file in.
//    Click the disk icon (or press Cmd/Ctrl+S) to save. If you like, rename the
//    project at the top left ("Untitled project") to something like "Tomstash".
//
// 4. Optional but recommended: set SECRET below to a long random string, and
//    save again. You will enter the same string in the extension's options.
//
// 5. Click the blue "Deploy" button at the top right, then "New deployment".
//    Next to "Select type", click the gear icon and choose "Web app", then set:
//      Description:    Tomstash (anything)
//      Execute as:     Me
//      Who has access: Anyone
//
// 6. Click "Deploy". Google asks you to "Authorize access": choose your account.
//    If it says "Google hasn't verified this app", click "Advanced", then
//    "Go to <project name> (unsafe)", then "Allow". It is your own script and
//    it only touches this one spreadsheet.
//
// 7. Copy the "Web app URL" shown at the end (it ends in /exec) and paste it
//    into the extension's options under Google Sheets. Click "Test connection".
//
// LATER CHANGES
// If you edit this code afterwards, saving is not enough: click Deploy, then
// "Manage deployments", pencil icon, Version: "New version", Deploy. The URL
// stays the same.
//
// The script creates a sheet tab called "Links" with a header row the first time
// you save a page. Apps Script needs plain function declarations for doPost,
// unlike the extension code.

const SECRET = ""; // Optional. If set, put the same value in the extension's options.
const SHEET_NAME = "Links"; // Tab that receives the rows. Created if missing. Use "Sheet1" for the first tab, then deploy a new version.
const COLUMNS = [
  "saved_at",
  "url",
  "title",
  "description",
  "tags",
  "category",
  "author",
  "reading_time",
  "lang",
  "image_url",
  "favicon_url",
  "content_md",
];
const CELL_LIMIT = 49000; // A Google Sheets cell holds at most 50,000 characters.

const reply = (data) =>
  ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: "Invalid JSON" });
  }
  if (SECRET && body.secret !== SECRET) return reply({ ok: false, error: "Wrong secret" });
  if (body.ping) return reply({ ok: true });

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(COLUMNS);

  sheet.appendRow(
    COLUMNS.map((name) => {
      const value = body[name] ?? "";
      return typeof value === "string" ? value.slice(0, CELL_LIMIT) : value;
    }),
  );
  return reply({ ok: true });
}
