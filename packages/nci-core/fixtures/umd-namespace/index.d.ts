export as namespace MyLib;

export interface Widget {
  id: string;
  render(): void;
}

export declare function createWidget(id: string): Widget;
