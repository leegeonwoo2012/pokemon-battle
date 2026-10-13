# Sprite asset folder

The application resolves transparent PNG files by National Pokédex number:

- `front/{number}.png` for the opponent-facing artwork
- `back/{number}.png` for the player's rear view

No character artwork is included in this project. The Pokémon Showdown sprite repository says those sprites belong to Nintendo, Game Freak, and The Pokémon Company, and asks users to request permission. The PokeAPI sprite repository also says its image contents are copyrighted by The Pokémon Company and disclaims responsibility for clearing third-party rights. Pokémon's official support page asks projects not to use or associate its IP. These sources do not give this project clear rights to redistribute the images, so the UI displays a labeled placeholder when a local file is unavailable.

Reviewed 2026-10-09:

- https://github.com/smogon/sprites#license
- https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt
- https://support.pokemon.com/hc/en-us/articles/360000634094-Can-I-use-Pok%C3%A9mon-images-or-materials

If you have artwork with permission for this project, place it at the paths above. Missing files are handled by the UI and do not affect battles.
