# Vendored libraries

Copied unmodified from npm. There is no build step; to update, run `npm pack <package>` in a temporary folder and copy the files again.

| File | Package | Version | License |
| --- | --- | --- | --- |
| `Readability.js` | `@mozilla/readability` | 0.6.0 | Apache-2.0 (`Readability.LICENSE.md`) |
| `turndown.browser.es.js` | `turndown` (`lib/turndown.browser.es.js`) | 7.2.5 | MIT (`turndown.LICENSE`) |

`Readability.js` is a classic script that the extension injects into the page. `turndown.browser.es.js` is an ES module imported by the popup.
