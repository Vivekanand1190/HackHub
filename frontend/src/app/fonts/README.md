# Vendored webfonts

These files are committed to the repository on purpose. The app is meant to run
with **zero third-party requests at runtime**, so the fonts are served from our
own origin instead of being fetched from a font CDN.

Loaded via `next/font/local` in `../layout.tsx`, which fingerprints and
self-hosts them at build time.

## Files

| File | Family | Weights | Subset |
| --- | --- | --- | --- |
| `SpaceGrotesk-Variable.woff2` | Space Grotesk | 400-700 (variable) | latin |
| `ArchivoBlack-Regular.woff2` | Archivo Black | 400 | latin |
| `JetBrainsMono-Variable.woff2` | JetBrains Mono | 400-700 (variable) | latin |

Space Grotesk and JetBrains Mono are variable fonts, so one file covers every
weight we use. Only the `latin` subset is vendored - the app's UI copy is
English. If you add localised UI text you will need to vendor the relevant
`latin-ext` / `cyrillic` / etc. subsets as well, otherwise those glyphs fall
back to the system font.

## Licence

All three families are licensed under the **SIL Open Font License 1.1**, which
permits redistribution and embedding. Copyright belongs to their respective
authors:

- Space Grotesk - Florian Karsten
- Archivo Black - Omnibus-Type
- JetBrains Mono - JetBrains

The full OFL text is at <https://openfontlicense.org/>. Keep this attribution
with the files if you redistribute them.

## Refreshing

To update a font, re-download the `latin` subset from the Google Fonts CSS API
(requesting the family with a modern browser user agent, which yields `woff2`)
and replace the file here, keeping the filename. Nothing else needs to change -
`layout.tsx` refers to these paths, not to any versioned CDN URL.
