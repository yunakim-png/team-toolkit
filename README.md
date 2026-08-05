# team-toolkit
cit team roadmap

## Project structure

Plain static files — no build step. Open `team-roadmap.html` directly or host it (e.g. GitHub Pages).

- `team-roadmap.html` — markup only; loads the CSS and JS below
- `css/styles.css` — all styles
- `js/supabase.js` — **Supabase connection + persistence lives here** (URL, key, load/save). Start here for any data/connection issue.
- `js/app.js` — app state, rendering, and UI logic

The JS files load as plain `<script>` tags (not ES modules), in order: `supabase.js` then `app.js`.
