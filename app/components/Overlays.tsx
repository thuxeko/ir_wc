'use client';

import { useEffect, useState, useCallback } from 'react';
import { setToastHandler } from '@/lib/toast';
import { setConfirmHandler } from '@/lib/confirm';
import { setPopupHandler } from '@/lib/popup';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

interface ToastItem {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'info';
}

export default function Overlays() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [confirmResolve, setConfirmResolve] = useState<((v: boolean) => void) | null>(null);
  const [popupTitle, setPopupTitle] = useState('');
  const [popupContent, setPopupContent] = useState('');

  // --- Toast ---
  const addToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  useEffect(() => {
    setToastHandler(addToast);
    return () => setToastHandler(null);
  }, [addToast]);

  // --- Confirm ---
  useEffect(() => {
    setConfirmHandler((msg: string) =>
      new Promise<boolean>((resolve) => {
        setConfirmMsg(msg);
        setConfirmResolve(() => resolve);
      })
    );
    return () => setConfirmHandler(null);
  }, []);

  const handleConfirm = (value: boolean) => {
    if (confirmResolve) confirmResolve(value);
    setConfirmMsg(null);
    setConfirmResolve(null);
  };

  // --- Popup ---
  useEffect(() => {
    setPopupHandler((title, content) => {
      setPopupTitle(title);
      setPopupContent(content);
    });
    return () => setPopupHandler(null);
  }, []);

  const icon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4" />;
      case 'error': return <XCircle className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  return (
    <>
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const colors: Record<string, string> = {
            success: 'border-[#346538] bg-[#EDF3EC] text-[#346538]',
            error: 'border-red-400 bg-red-50 text-red-700',
            info: 'border-[#1F6C9F] bg-[#E1F3FE] text-[#1F6C9F]',
          };
          return (
            <div
              key={t.id}
              className={`pointer-events-auto card px-4 py-3 flex items-center gap-2 text-sm shadow-lg ${colors[t.type]}`}
              style={{ animation: 'fadeSlide 0.3s ease' }}
            >
              {icon(t.type)}
              <span>{t.msg}</span>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-2 opacity-60 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirm Dialog */}
      {confirmMsg !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[210]">
          <div className="card w-full max-w-sm p-6 mx-4">
            <div className="text-sm mb-4">{confirmMsg}</div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => handleConfirm(false)} className="px-4 py-2 border border-[#EAEAEA] rounded text-sm hover:bg-white">Hủy</button>
              <button onClick={() => handleConfirm(true)} className="px-4 py-2 btn text-sm">Xác nhận</button>
            </div>
          </div>
        </div>
      )}

      {/* Details Popup */}
      {popupContent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[210]" onClick={() => setPopupContent('')}>
          <div className="card w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#EAEAEA]">
              <span className="font-semibold text-sm">{popupTitle}</span>
              <button onClick={() => setPopupContent('')} className="text-[#787774] hover:text-[#111]"><X className="w-4 h-4" /></button>
            </div>
            <pre className="overflow-auto p-4 text-xs font-mono whitespace-pre-wrap break-all max-h-[60vh]">{popupContent}</pre>
          </div>
        </div>
      )}
    </>
  );
}
