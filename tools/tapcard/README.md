# Tap Card

A conference card people get by scanning your phone. Colleagues make their own at
<https://alettazhao.github.io/t/> with the invite code.

## Links

| What | Address |
| --- | --- |
| Maker | `/t/` |
| A person's card (what the QR opens) | `/t/?alex-morgan` (add `&via=tap` for NFC stickers) |
| Their scan page (shown on their phone) | `/t/qr.html?alex-morgan` |
| Edit | `/t/?edit=alex-morgan#<edit key>` (emailed to them; the key is then kept on their device) |

Old `/tapcard/?u=…` links redirect to `/t/`.

## Files (`static/t/`)

| File | Role |
| --- | --- |
| `config.js` | Supabase project URL and publishable key. Empty = demo mode (cards stay in the browser). |
| `tapcard.js` | Shared library: talking to Supabase, QR drawing, vCard, card HTML, wallpaper. |
| `tapcard.css` | Colours (light/dark) and the card's look. Used by every page. |
| `index.html` / `.css` / `.js` | Maker (step 1 → draft → publish → success), edit mode, and the card itself (`?name`). |
| `import.js` | Reads a CV (PDF, via pdf.js) or a homepage and guesses the fields. |
| `qr.html` / `.css` / `.js` | The scan page: flip between card and featured-work QR, keeps the screen awake. |
| `sw.js` | Offline support for the scan page. Bump `CACHE` when changing the file list. |

After changing any `.css`/`.js` file, raise the `?v=` number on its links in `index.html`
and `qr.html` (and in `CORE` in `sw.js`). Browsers keep files for ~10 minutes otherwise,
and a visitor could get new code with old styles.

The conference chips are the `EVENTS` list at the top of `index.js`. The fictional
example card is `EXAMPLE` right below it.

## Database (Supabase project `tapcard`, Frankfurt)

Run once in Supabase → SQL Editor, in this order. Both are safe to re-run.

1. `setup.sql` — tables, access rules, create/update/delete functions, file storage.
   Change `CHANGE-ME` to the invite code in the editor (not in this file).
2. `import.sql` — invite pre-check, reading homepages that block browsers, reserved link names.

To change the invite code later, run:
`update app_config set value = 'new-code' where key = 'invite_code';`

Someone lost their edit link? Fix or delete their row in Table Editor → `cards`.
Their files are under Storage → `tapcard/<their link name>/`.

## Keeping it awake

Free Supabase projects pause after 7 days without traffic. The GitHub Action
`.github/workflows/tapcard-keepalive.yml` reads one row every 3 days. GitHub turns off
scheduled workflows after 60 days with no commits to the repo: re-enable it under
the repo's Actions tab if that happens.
