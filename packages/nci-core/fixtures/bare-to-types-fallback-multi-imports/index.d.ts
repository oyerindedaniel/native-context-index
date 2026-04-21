import type { AlphaType } from "runtime-no-types-alpha";
import type { BetaType } from "runtime-no-types-beta";

export interface UsesMultipleFallbackPackages {
  alpha: AlphaType;
  beta: BetaType;
}
