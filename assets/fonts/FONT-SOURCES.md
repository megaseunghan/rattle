# Rattle font assets

Native body: Wanted Sans. Numeric emphasis: Geist.
Runtime aliases and assets are declared in `constants/fonts.ts`.

- Wanted Sans source: https://github.com/wanteddev/wanted-sans/tree/main/packages/wanted-sans/fonts/variable
- Geist source: https://github.com/vercel/geist-font/tree/main/fonts/Geist/variable
- Original variable TTF SHA256: Wanted Sans `9953a7cfc4a3cba4ef1242abaf89779b3cd15fd9729c2d67d9e9d37a0da967f5`; Geist `73894e0448cae90a92b6c2f8732b7bb9acb7b94c418bff559dad4a18e1de9659`.
- Both sources were obtained for the approved design study on 2026-10-22. Their OFL license texts are retained beside the assets.
- The native TTFs are static instances at weights 400, 500, 600 and 700, generated with fontTools 4.67.0. Wanted Sans instance family/subfamily/PostScript names and weight flags were assigned per style because the source STAT Mac name records did not support automatic name-table updates. Glyph outlines were generated through variable-font instancing without manual edits.
- Earlier Pretendard and Space Grotesk files remain as historical assets. They are not referenced by the current `FONT_ASSETS` registry; the old TypeScript token names are compatibility aliases to the approved new faces.
