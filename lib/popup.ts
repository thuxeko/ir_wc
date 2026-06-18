type PopupHandler = (title: string, content: string) => void;

let handler: PopupHandler | null = null;

export function setPopupHandler(fn: PopupHandler) { handler = fn; }

export function showPopup(title: string, content: string) {
  if (handler) handler(title, content);
}
