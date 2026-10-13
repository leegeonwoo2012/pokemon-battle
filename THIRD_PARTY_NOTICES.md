# Third-party notices

This is an unofficial, non-commercial local fan project. It is not affiliated with or endorsed by Nintendo, Game Freak or The Pokémon Company. Pokémon names and character art remain the property of their respective owners.

## Battle data

The selectable Regulation M-C catalog, form/base stats, types, ability identifiers and move learnsets are derived from [Pokémon Showdown Champions data at commit `942cda71d14bf0618bd57991708a2e2734b6daba`](https://github.com/smogon/pokemon-showdown/tree/942cda71d14bf0618bd57991708a2e2734b6daba/data/mods/champions). Copyright © 2011–2026 Guangcong Luo and contributors; MIT license preserved at [`docs/licenses/pokemon-showdown-MIT.txt`](docs/licenses/pokemon-showdown-MIT.txt). The source snapshot is in `work/regmc/`; per-file hashes and the derived list are in `docs/data-sources.json` and `docs/regulation-m-c.json`. This project does not embed the Showdown battle simulator.

Korean species, ability and move names and variant Pokémon IDs are derived from [PokeAPI CSV data](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv). Copyright © PokeAPI contributors; BSD license preserved at [`docs/licenses/pokeapi-BSD.txt`](docs/licenses/pokeapi-BSD.txt). Repository code licenses do not grant rights to Pokémon character artwork.

## Artwork

Some base sprites are first Idle frames extracted from credited fan artwork in [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab). These works carry CC BY-NC 4.0: non-commercial use and attribution are required. The license is preserved at [`public/sprites/licenses/PMDCollab-CC-BY-NC-4.0.md`](public/sprites/licenses/PMDCollab-CC-BY-NC-4.0.md). Individual authors, source paths and hashes are recorded in [`public/sprites/attribution.json`](public/sprites/attribution.json) and [`public/sprites/CREDITS.md`](public/sprites/CREDITS.md). Source drawings credited to CHUNSOFT were excluded from this group.

Other base sprites and the verified Mega/Gigantamax form PNGs come from [PokeAPI/sprites](https://github.com/PokeAPI/sprites). The repository recommends direct download for applications, but its [`LICENCE.txt`](public/sprites/licenses/PokeAPI-sprites-LICENCE.txt) states that the image contents are Copyright The Pokémon Company. The repository's CC0 notice is **not** represented as placing Pokémon artwork in the public domain. The 264 current selectable species/form pairs are indexed in `public/sprites/manifest.json`; 82 Mega and 15 implemented Gigantamax form pairs are indexed in `public/sprites/forms/manifest.json`. Additional historical files in the directory are outside the current manifests.

`public/sprites/unavailable.svg` is an original missing-image graphic and is never counted as a verified Pokémon sprite. The game does not bundle official music or sound effects. Other software dependencies retain their licenses in their npm distributions.
