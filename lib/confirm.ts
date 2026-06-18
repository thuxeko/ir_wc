let handler: ((msg: string) => Promise<boolean>) | null = null;

export function setConfirmHandler(fn: ((msg: string) => Promise<boolean>) | null) { handler = fn; }

export function confirm(msg: string): Promise<boolean> {
  return handler ? handler(msg) : Promise.resolve(false);
}
