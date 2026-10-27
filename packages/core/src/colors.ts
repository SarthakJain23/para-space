/** A worktree's window color, with a deeper shade (inactive title bar, borders) and a lighter one (hover). */
export interface ColorProfile {
  name: string;
  hex: string;
  dark: string;
  light: string;
}

/**
 * Index 0 is the main repo; 1–7 are worktree colors (D-034).
 *
 * Built in OKLCH so every worktree color has the same perceived lightness (L≈0.54): none looks
 * louder than another. Hues sit about 45° apart and alternate warm/cool, so neighbouring
 * worktrees differ the most. Each passes WCAG AA for white text (≥ 4.7:1) and 3:1 as a dot
 * on a dark status bar. `dark` is L−0.07, `light` is L+0.06, same hue.
 */
export const PALETTE: ColorProfile[] = [
  { name: 'Graphite', hex: '#414853', dark: '#30363f', light: '#525864' },
  { name: 'Lagoon', hex: '#137d87', dark: '#006871', light: '#2f8f99' },
  { name: 'Coral', hex: '#be414a', dark: '#a32f39', light: '#d3555b' },
  { name: 'Violet', hex: '#7855c3', dark: '#6442a8', light: '#8967d7' },
  { name: 'Ochre', hex: '#9e6414', dark: '#875100', light: '#b2762c' },
  { name: 'Cobalt', hex: '#2d6fbe', dark: '#1c5aa3', light: '#4081d2' },
  { name: 'Jade', hex: '#34814e', dark: '#216b3c', light: '#47935f' },
  { name: 'Orchid', hex: '#a5478e', dark: '#8c3578', light: '#b95aa0' },
];

/**
 * Window color for a worktree index. 0 is the main repo; worktrees cycle through the rest.
 *
 * @param index - Worktree index (0 for main repo, ≥ 1 for linked worktrees).
 * @returns The `ColorProfile` assigned to that index.
 *
 * @example
 * colorForIndex(0); // → Graphite #414853
 * colorForIndex(1); // → Lagoon #137d87
 * colorForIndex(8); // → Lagoon again (7 worktree colors)
 */
export function colorForIndex(index: number): ColorProfile {
  if (index <= 0) return PALETTE[0];
  return PALETTE[1 + ((index - 1) % (PALETTE.length - 1))];
}

/**
 * Resolves a hex color string to its corresponding ColorProfile from the palette.
 * Falls back to the first worktree color (Lagoon) if hex is not found.
 *
 * @param hex - Hex color code, e.g. '#137d87'.
 * @returns The matching ColorProfile.
 *
 * @example
 * colorForHex('#137d87'); // → PALETTE[1] (Lagoon)
 */
export function colorForHex(hex?: string): ColorProfile {
  if (!hex) return PALETTE[1];
  return PALETTE.find((p) => p.hex.toLowerCase() === hex.toLowerCase()) ?? PALETTE[1];
}

/**
 * VS Code `workbench.colorCustomizations` for a worktree window (D-006, D-034).
 *
 * Colors the two bands that identify a window, the title bar and the status bar, and leaves the
 * activity bar in the user's theme with only a colored active-item marker, so the window stays
 * calm. The inactive title bar uses the solid deeper shade: semi-transparent colors blend with
 * whatever is behind them and turn muddy.
 *
 * @param profile - `ColorProfile` containing `hex`, `dark`, and `light` shades.
 * @returns Map of VS Code workbench color customization keys to hex color strings.
 *
 * @example
 * settings['workbench.colorCustomizations'] = peacockSettings(colorForIndex(1));
 */
export function peacockSettings({ hex, dark, light }: ColorProfile): Record<string, string> {
  return {
    'titleBar.activeBackground': hex,
    'titleBar.activeForeground': '#ffffff',
    'titleBar.inactiveBackground': dark,
    'titleBar.inactiveForeground': '#ffffffb3',
    'titleBar.border': dark,
    'activityBar.activeBorder': hex,
    'activityBarBadge.background': hex,
    'activityBarBadge.foreground': '#ffffff',
    'statusBar.background': hex,
    'statusBar.foreground': '#ffffff',
    'statusBar.border': dark,
    'statusBarItem.hoverBackground': light,
    'statusBarItem.remoteBackground': dark,
    'statusBarItem.remoteForeground': '#ffffff',
  };
}
