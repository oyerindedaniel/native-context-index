export interface HeritageRowA {
  keepA: string;
  dropFromA: number;
}

export interface HeritageRowB {
  keepB: boolean;
  dropFromB: string;
}

/**
 * Multiple `extends` use the same type constructor (`Omit`) with different
 * type arguments; heritage lists each clause distinctly (full span text).
 */
export interface MergedRows extends Omit<HeritageRowA, "dropFromA">, Omit<HeritageRowB, "dropFromB"> {
  mergedOnly: symbol;
}

/** Local generic parent — flattening must resolve through `<` to find this. */
export interface GenericParent<T> {
  parentValue: T;
  parentFixed: boolean;
}

/** Extends a local generic — tests that `heritage_lookup_key("GenericParent<string>")` → "GenericParent". */
export interface GenericChild extends GenericParent<string> {
  childOwn: number;
}

/** Deep nesting in type args: `GenericParent<Array<Map<string, number>>>`. */
export interface DeepGenericChild extends GenericParent<Array<Map<string, number>>> {
  deepOwn: string;
}

/**
 * Two-level chain: GrandChild → GenericChild → GenericParent<string>.
 * Tests transitive flattening when intermediate has generic heritage too.
 */
export interface GrandChild extends GenericChild {
  grandOwn: symbol;
}
