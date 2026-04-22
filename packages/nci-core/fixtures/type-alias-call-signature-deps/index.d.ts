export interface InputShape {
  value: string;
}

export interface OutputShape {
  ok: boolean;
}

export type CallableContainer = {
  (input: InputShape): OutputShape;
  label: string;
};
