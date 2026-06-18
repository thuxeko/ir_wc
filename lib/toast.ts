type ToastType = 'success' | 'error' | 'info';
type ToastHandler = (msg: string, type?: ToastType) => void;

let handler: ToastHandler | null = null;

export function setToastHandler(fn: ToastHandler) { handler = fn; }

export function toast(msg: string, type: ToastType = 'info') {
  if (handler) handler(msg, type);
}
