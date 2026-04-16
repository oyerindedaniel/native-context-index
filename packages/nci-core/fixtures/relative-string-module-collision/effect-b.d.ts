export interface EffectBBase {
  readonly source: "effect-b";
}

declare module "./Effect.js" {
  interface EffectFromB {
    readonly fromB: true;
  }
}
