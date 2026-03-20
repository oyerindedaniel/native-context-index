interface Internal {
  id: string;
}

export { Internal as External };

declare const x: number;
export default x;
