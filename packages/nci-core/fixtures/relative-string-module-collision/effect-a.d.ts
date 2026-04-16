export interface EffectABase {
  readonly source: "effect-a";
}

declare module "./Effect.js" {
  interface EffectFromA {
    readonly fromA: true;
  }
}
