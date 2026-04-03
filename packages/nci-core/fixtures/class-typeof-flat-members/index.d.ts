/** Declared only so `Box` can use `typeof InnerForBox`. */
declare class InnerForBox {
  get id(): string;
  set id(v: string);
  accessor tag: number;
  static parse(input: string): InnerForBox;
  check(): boolean;
}

export declare const Box: typeof InnerForBox;
