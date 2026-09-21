import { ReactNode, useEffect } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  depth?: number;
};

export function Modal({ title, onClose, children, depth = 0 }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" style={{ zIndex: 50 + depth * 10 }} onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="secondary" onClick={onClose}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}
