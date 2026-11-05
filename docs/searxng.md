# Using your own SearXNG instance

Kyber Fox can search with a self-hosted [SearXNG](https://docs.searxng.org/)
instance, or any other search engine that takes the query in its URL. It uses
Firefox's own "Add search engine" in Settings; Kyber Fox adds nothing for it.
The browser test `browser_search_user_engine.js` checks that the button stays
available and that such an engine can be the default.

In the steps, replace `https://searx.example.org` with the address of your
instance.

## Add the engine

1. Open **Settings**, then **Search**.
2. Under **Additional search engines**, click **Add search engine**.
3. Fill in:
   - **Search engine name**: for example `SearXNG`.
   - **URL with %s in place of search term**:
     `https://searx.example.org/search?q=%s`
   - **Keyword (optional)**: for example `@sx`, to search with it from the
     address bar by typing `@sx` and the search terms.
4. Click **Add Engine**.

Some instances need `/search?q=%s` replaced by the path their own search page
uses. To check, search on the instance's page and compare the address it
shows.

## Make it the default

1. In **Settings**, **Search**, pick it under **Default search engine**.
2. Private windows have their own default. Under the same heading, the
   option **Use a different default search engine in private windows** and
   its list set that one. Pick SearXNG there as well if you want it in
   private windows too.

## Search suggestions (optional)

Kyber Fox turns search suggestions off, so the address bar does not send
what you type to a search engine before you press Enter. To use your
instance's suggestions:

1. Add the engine with **Suggestions URL with %s in place of search term**
   set to `https://searx.example.org/autocompleter?q=%s`, and enable
   autocomplete in the instance's own settings.
2. In **Settings**, **Search**, turn on **Show search suggestions**.

Every key you type in the address bar then goes to your instance.

## Privacy

- Your instance receives every search, and its operator sees them. If you
  run it yourself, that is you; if someone else runs it, choose one you
  trust.
- Use an `https://` address. Kyber Fox's HTTPS-only mode upgrades plain
  `http://` addresses to HTTPS, including addresses on your local network,
  and shows a warning page before loading a site that has no HTTPS.
- An instance on your home network works only where that network is
  reachable.

## Welcome page

The first-run welcome page lists only the built-in engines. It has no field
for a custom address for now; this page is the way to add one.
