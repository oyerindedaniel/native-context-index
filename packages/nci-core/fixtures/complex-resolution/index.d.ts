import { InternalType } from "./internal";

export interface PublicInterface extends InternalType {
  name: string;
}

export type Alias = import("./internal").InternalType;

type PrivateLocal = {
  id: number;
};

export interface UsesPrivateLocal {
  data: PrivateLocal;
}
