declare class InnerParen {
  fromClass(): void;
}

export declare const ParenBox: (typeof InnerParen) & { merged(): void };
