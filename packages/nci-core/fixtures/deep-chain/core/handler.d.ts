export type Handler = (req: Request, res: Response) => void;

export interface Request {
  url: string;
  method: string;
}

export interface Response {
  status: number;
  body: string;
}
