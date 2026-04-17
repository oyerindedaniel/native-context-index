declare module "OuterSpec" {
  export interface BetweenInnerAndOuter {
    readonly slotBetweenLayers: true;
  }

  declare module "InnerSpec" {
    export interface InnerOnlySymbol {
      readonly innerScopeMarker: true;
    }
  }
}

declare global {
  export interface GlobalAugmentedRow {
    readonly fromGlobalBlock: true;
  }
}

declare namespace ContainerNs {
  export interface ContainerMember {
    readonly underIdentifierNamespace: true;
  }
}

declare module "./WrappedAmbient.js" {
  export interface HostInterface {
    memberKey: string;
  }
}
