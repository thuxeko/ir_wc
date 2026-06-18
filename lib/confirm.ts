let handler: ((msg: string) => Promise<boolean>) | null = null;

export function setConfirmHandler(fn: typeof handler) { handler = fn; }

export function confirm(msg: string): Promise<boolean> {
  return handler ? handler(msg) : Promise.resolve(false);
}
