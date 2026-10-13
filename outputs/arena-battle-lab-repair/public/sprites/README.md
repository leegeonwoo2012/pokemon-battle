# Authorized sprite files

Place only assets you have permission to use in this project under:

- front/{National Dex number}.png
- back/{National Dex number}.png

For example front/25.png and back/25.png belong to Pikachu. Do not substitute another species or form.

Run `npm run assets:index` to validate actual files and write manifest.json. Missing assets produce an INCOMPLETE result and exit code 1. Runtime reads the manifest, so nonexistent paths are never treated as ready images. The graphical importer in Settings alternatively saves user-provided PNGs in the current browser's IndexedDB. Missing backs fall back only to the same species' front.

No Pokémon images are included in this distribution. See ../../docs/sprite-sources.md and ../../THIRD_PARTY_NOTICES.md for source and rights review. Any new distributed image set must retain its own license and required author credits.
