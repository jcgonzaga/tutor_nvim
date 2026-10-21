/** Shape of `vim-oracle.json`, as written by `scripts/vim-oracle.ts`. */
export interface OracleFixtures {
  readonly vim: string;
  readonly cases: Record<
    string,
    {
      readonly keys: string;
      readonly lines: readonly string[];
      readonly line: number;
      readonly col: number;
      /** Vim's unnamed register contents (linewise text ends with a newline). */
      readonly register: string;
      /** `v` charwise, `V` linewise, empty when the register is empty. */
      readonly registerType: string;
    }
  >;
}
