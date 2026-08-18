/**
 * Which of the ten languages the reader of the user guide gets.
 *
 * GitHub Pages serves static files and never sees `Accept-Language`, so the match
 * cannot happen on the way out. It happens here, in `<head>`, before there is
 * anything on screen to flash.
 *
 * Two jobs. Every page remembers an explicit choice: the language bar tags its
 * links with `?lang=`, which is stored and then wiped out of the address bar so
 * that nobody copies a URL with our bookkeeping in it. And the English page —
 * which is where a bare link to the site lands, and the only page that redirects
 * at all — sends a reader who has expressed no choice to the language their
 * browser asks for. Nine pages that never redirect is nine pages you can stay on,
 * and no loop to fall into.
 *
 * Plain JS on purpose, with the environment passed in rather than reached for:
 * `_includes/head-custom.html` supplies the real window, `tests/site.test.js`
 * supplies a fake one.
 */
function interpretabLanguage(site, win) {
  var KEY = "interpretab.lang";
  var stored = null;

  /* Private browsing, and some enterprise policies, make `localStorage` throw on
     access rather than return null. A reader who cannot be remembered still gets
     a language; they just get asked again next time. */
  try {
    stored = win.localStorage;
  } catch (e) {
    stored = null;
  }

  var found = /[?&]lang=([a-z]{2})(?:&|$)/.exec(win.location.search);
  /* A `?lang=` naming a language there is no page in is not a choice, and storing
     it would be a choice that can never be honoured and never expires. It comes
     off the address bar either way: junk in a URL is still junk to sweep up. */
  var asked = found && site.pages.indexOf(found[1]) >= 0 ? found[1] : null;
  if (asked && stored) {
    try {
      stored.setItem(KEY, asked);
    } catch (e) {
      /* Quota, or a storage partition that only pretends to exist. */
    }
  }
  if (found && win.history && win.history.replaceState) {
    win.history.replaceState(null, "", win.location.pathname + win.location.hash);
  }

  if (!site.redirect) return null;

  var wanted = asked ? [asked] : null;
  if (!wanted && stored) {
    try {
      var saved = stored.getItem(KEY);
      if (saved) wanted = [saved];
    } catch (e) {
      /* As above. */
    }
  }
  /* `navigator.languages` is the browser's preferred-language list, which in
     Chrome is the setting `chrome.i18n` reads — so the guide and the extension's
     own interface agree about the reader without being told to. */
  if (!wanted) wanted = win.navigator.languages || [win.navigator.language || "en"];

  for (var i = 0; i < wanted.length; i++) {
    /* A region is not a translation. `de-AT` reads the German page, and `zh-TW`
       reads a Simplified one — a worse answer than a Traditional page and a
       better one than an English page. */
    var code = String(wanted[i]).toLowerCase().split("-")[0];
    if (code === "en") return null;
    if (site.pages.indexOf(code) >= 0) {
      var target = site.home + code + "/";
      /* `replace`, not `assign`: a history entry here means Back returns to this
         page and is redirected straight out of it again. */
      win.location.replace(target);
      return target;
    }
  }
  return null;
}
