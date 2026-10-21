# Authorized sprite files

Place only assets you have permission to use in this project under:

- front/{National Dex number}.png
- back/{National Dex number}.png

For example front/25.png and back/25.png belong to Pikachu. Do not substitute another species or form.

Run `npm run assets:index` to validate PNG bytes, dimensions and actual Chrome decoding, then write manifest.json. Missing assets produce an INCOMPLETE result and exit code 1, after indexing successfully decoded files. Runtime verifies HTTP status, MIME and actual decoding; wrong Dex or facing paths are rejected. The graphical importer in Settings alternatively saves validated user-provided PNGs in the current browser's IndexedDB. Cached blobs are revalidated. Missing backs fall back only to the same species' front, labeled as such and not counted as back success. Missing artwork uses the original unavailable.svg and full name with a warning.

The indexed roster has 389 species: 387 with front/back pairs and two Pokémon Z fan evolutions with front art only. Their opponents use the same-species front art when no back sprite is available. Additional older species pairs remain in this directory but are not indexed by the current manifest. The PokeAPI repository recommends downloading sprites for applications; its notice is CC0 1.0 for the repository and expressly reserves image copyright to The Pokémon Company. Retain CREDITS.md, attribution.json and licenses/ with each source's notices. PMDCollab images are extracted from first Idle South/North direction frames, excluding official CHUNSOFT and different-form entries from that group. See ../../docs/sprite-sources.md and ../../THIRD_PARTY_NOTICES.md for source details.

Run `npm run assets:audit` for all 540 current-roster HTTP responses, browser decoding, name/Dex/source hash checks and a contact sheet. Name verification for arbitrary user imports requires visual review; matching filenames alone cannot identify an image.
