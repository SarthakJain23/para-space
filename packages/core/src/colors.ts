export interface ColorProfile {
  name: string;
  hex: string;
}

/** Index 0 is reserved for the main repo. */
export const PALETTE: ColorProfile[] = [
  { name: 'Blue', hex: '#1e5aa8' },
  { name: 'Teal', hex: '#008080' },
  { name: 'Amber', hex: '#b36b00' },
  { name: 'Purple', hex: '#6b3fa0' },
  { name: 'Crimson', hex: '#a3213a' },
  { name: 'Green', hex: '#2e7d32' },
  { name: 'Slate', hex: '#455a64' },
  { name: 'Magenta', hex: '#a0307a' },
];

export function colorForIndex(index: number): ColorProfile {
  if (index <= 0) return PALETTE[0];
  return PALETTE[1 + ((index - 1) % (PALETTE.length - 1))];
}

/** Peacock-pattern workbench customizations (D-006). */
export function peacockSettings(hex: string): Record<string, string> {
  return {
    'titleBar.activeBackground': hex,
    'titleBar.activeForeground': '#ffffff',
    'titleBar.inactiveBackground': `${hex}99`,
    'titleBar.inactiveForeground': '#ffffffaa',
    'activityBar.background': hex,
    'activityBar.foreground': '#ffffff',
    'statusBar.background': hex,
    'statusBar.foreground': '#ffffff',
  };
}
