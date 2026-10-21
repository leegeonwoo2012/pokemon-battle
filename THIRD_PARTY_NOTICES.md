# Third-party notices

This is an unofficial, non-commercial local fan project. It is not affiliated with or endorsed by Nintendo, Game Freak or The Pokémon Company. Pokémon names and character art remain the property of their respective owners.

## Battle data

The selectable Regulation M-C catalog, legendary classifications, form/base stats, types, ability identifiers and move learnsets are derived from [Pokémon Showdown at commit `942cda71d14bf0618bd57991708a2e2734b6daba`](https://github.com/smogon/pokemon-showdown/tree/942cda71d14bf0618bd57991708a2e2734b6daba/data). Copyright © 2011–2026 Guangcong Luo and contributors; MIT license preserved at [`docs/licenses/pokemon-showdown-MIT.txt`](docs/licenses/pokemon-showdown-MIT.txt). The source snapshot is in `work/regmc/`; per-file hashes and the derived lists are in `docs/data-sources.json`, `docs/regulation-m-c.json` and `docs/legendary-roster.json`. This project does not embed the Showdown battle simulator.

Korean species, ability and move names and variant Pokémon IDs are derived from [PokeAPI CSV data](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv). Copyright © PokeAPI contributors; BSD license preserved at [`docs/licenses/pokeapi-BSD.txt`](docs/licenses/pokeapi-BSD.txt). Repository code licenses do not grant rights to Pokémon character artwork.

## Artwork

The battle background is a crop and WebP conversion of “Beautiful surroundings of Planina Zajamniki, Pokljuka plateau near Lake Bohinj, Julian Alps in Triglav National Park” by Jernej Furman, licensed CC BY 2.0. Attribution and the source link are in [`public/sprites/CREDITS.md`](public/sprites/CREDITS.md).

The fan-made Eevee evolutions 제피레온 (Cefireon) and 로얄레온 (Royaleon) use cropped front sprites from the combined image in the [Pokémon Z fan-game guide](https://pokemonzfangame.com/new-regional-forms-evolutions/). The guide reports their names, typing, base stats and abilities. It does not state a license for the sprite artwork or name its artist; source and modifications are recorded in [`public/sprites/attribution.json`](public/sprites/attribution.json) and [`public/sprites/CREDITS.md`](public/sprites/CREDITS.md).

Some base sprites are first Idle frames extracted from credited fan artwork in [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab). These works carry CC BY-NC 4.0: non-commercial use and attribution are required. The license is preserved at [`public/sprites/licenses/PMDCollab-CC-BY-NC-4.0.md`](public/sprites/licenses/PMDCollab-CC-BY-NC-4.0.md). Individual authors, source paths and hashes are recorded in [`public/sprites/attribution.json`](public/sprites/attribution.json) and [`public/sprites/CREDITS.md`](public/sprites/CREDITS.md). Source drawings credited to CHUNSOFT were excluded from this group.

Other base sprites and the verified Mega/Gigantamax/Primal form PNGs come from [PokeAPI/sprites](https://github.com/PokeAPI/sprites). The repository recommends direct download for applications, but its [`LICENCE.txt`](public/sprites/licenses/PokeAPI-sprites-LICENCE.txt) states that the image contents are Copyright The Pokémon Company. The repository's CC0 notice is **not** represented as placing Pokémon artwork in the public domain. The 344 current selectable species/form pairs are indexed in `public/sprites/manifest.json`; verified transformation pairs are indexed in `public/sprites/forms/manifest.json`. Mega Zygarde's 512×512 front and back images were extracted from the first frame of PokeAPI's Legends: Z-A animated WebP resources (PokéAPI form ID 10301); PokeAPI's sprite README credits DoveKyle for generation-9 back and Z-A Mega sprites. The source URLs, local PNG hashes and extraction frame are recorded in the form manifest. Additional historical files in the directory are outside the current manifests.

`public/sprites/unavailable.svg` is an original missing-image graphic and is never counted as a verified Pokémon sprite. The game does not bundle official music or sound effects. Other software dependencies retain their licenses in their npm distributions.
