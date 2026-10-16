/** Markdown inline code: `x` */
export const code = (s: string | number): string => `\`${s}\``;

/** `a`, `b`, `c` */
export const codeList = (items: Array<string | number>): string => items.map(code).join(', ');
