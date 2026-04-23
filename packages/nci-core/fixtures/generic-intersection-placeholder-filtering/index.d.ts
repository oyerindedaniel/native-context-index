export interface ConcreteLeft {
  left: boolean;
}

export interface ConcreteRight {
  right: string;
}

export interface Slot {
  field: ConcreteRight;
}

export interface Carrier<GenericParam extends Slot = Slot> {
  mixed: GenericParam & ConcreteLeft;
  concretePair: ConcreteLeft & ConcreteRight;
  indexed: GenericParam["field"] & ConcreteLeft;
}
