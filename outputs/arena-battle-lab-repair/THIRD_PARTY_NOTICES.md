# Third-party notices

This is an unofficial non-commercial local fan project. No affiliation or endorsement is claimed. Pokémon names and related trademarks belong to their respective owners.

## Pokémon Showdown data

Species IDs, National Dex numbers, types, base stats, ability names and learned-move references are derived from https://github.com/smogon/pokemon-showdown/tree/master/data (pokedex.ts and learnsets.ts). Copyright (c) 2011–2026 Guangcong Luo and other contributors. MIT license text is preserved in docs/licenses/pokemon-showdown-MIT.txt. The battle runtime is this project's own limited engine; it is not the Showdown simulator.

## PokeAPI name data

Korean species and ability names and identifier mappings are derived from https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv. Copyright (c) 2013–2023 Paul Hallett and PokéAPI contributors. BSD terms and disclaimer are preserved in docs/licenses/pokeapi-BSD.txt. These repository licenses are not claimed to grant rights to Pokémon character artwork or trademarks.

Source file hashes and generation time: docs/data-sources.json. Per-species evidence: docs/roster-evidence.json. Generated learnsets are cross-generation unions filtered to the moves supported by this engine.

## Artwork

No official Pokémon artwork, sound, or music is bundled. Users may import their own authorized PNG assets locally. Any later distributed sprite package requires its own source/license and attribution review. scripts/browser-assets.mjs uses an original TEST ONLY diagnostic image; it is not a Pokémon asset and is excluded from deliverable bundles.

Other software dependencies retain their licenses in their npm distributions and package-lock.json records their versions.
