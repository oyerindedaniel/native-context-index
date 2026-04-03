import * as shim from "./shim";
import * as peer from "@peer/core";
import * as ext from "@external/types";

export interface LocalResult {
  ok: boolean;
}

/** Resolves to shim types in the same package graph. */
export declare function localNs(
  opts?: shim.InvokeOutputOptions,
): shim.Output<LocalResult>;

/** Resolves via fixture node_modules peer package (still one graph). */
export declare function peerNs(o?: peer.PeerOpts): peer.PeerOut<string>;

/** No local install: stable stub edge `npm::@external/types::InvokeOutputOptions`. */
export declare function unresolvedExt(x: ext.InvokeOutputOptions): void;
