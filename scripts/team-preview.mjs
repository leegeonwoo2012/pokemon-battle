export const TEAM_PREVIEW_MS = 90_000;
export const selectionCount = format => format === 'doubles' ? 4 : 3;

/** The opponent receives only publicly visible entry information. */
export function publicEntry(team, species) {
  return team.map(set => ({
    speciesId: set.speciesId,
    speciesName: species[set.speciesId]?.name ?? set.speciesId,
    level: 50,
    gender: set.gender ?? null,
    form: set.speciesId,
    itemRevealed: false,
    abilityRevealed: false,
  }));
}

export function validateSelection(indices, teamLength, format) {
  const count = selectionCount(format);
  return Array.isArray(indices) && indices.length === count &&
    indices.every(index => Number.isInteger(index) && index >= 0 && index < teamLength) &&
    new Set(indices).size === count;
}

export function selectedTeam(team, indices) {
  return indices.map(index => structuredClone(team[index]));
}
