/** Line-by-line equality; shared by every objective that compares text (the Vim, shell and workspace kinds). */
export const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);
