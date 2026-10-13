# Sprite source review

Reviewed 2026-10-09. No character sprite files have been imported into public/sprites.

- PokeAPI/sprites, https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt: explicitly identifies image copyright as The Pokémon Company. The CC0 repository notice disclaims clearing third-party rights. It is not evidence of permission from the artwork rights holder.
- smogon/sprites, https://github.com/smogon/sprites#license: identifies the Pokémon rights holders and asks users to request permission; community sprite license is not clearly established there.
- PMDCollab/SpriteCollab, https://github.com/PMDCollab/SpriteCollab: community submissions have CC BY-NC 4.0 terms with attribution. However official Chunsoft art is also present and identified in tracker.json. The base Pikachu and Tyranitar sprite entries identify CHUNSOFT. A collection-wide license alone therefore does not establish a licensed 180-species base-form set for this project. Alternate forms must not be passed off as the requested base form.
- TheArtificial/pokemon-icons, https://github.com/TheArtificial/pokemon-icons: original fan icons exist, but no explicit reuse license was located in its README or published gallery. Public accessibility alone is not sufficient to claim permission.
- Pokémon support, https://support.pokemon.com/hc/en-us/articles/360000634094-Can-I-use-Pok%C3%A9mon-images-or-materials: asks users not to use Pokémon IP in a project.

The code now handles this as an incomplete asset library, not an apparently successful sprite fallback. The asset checker reports all missing front/back images. It does not certify visual identity or legal rights merely because a PNG has the right filename.
