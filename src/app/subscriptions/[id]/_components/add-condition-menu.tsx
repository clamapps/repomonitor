"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type AddConditionMenuProps = {
  children: ReactNode;
  menuId: string;
};

export function AddConditionMenu({
  children,
  menuId,
}: AddConditionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="add-condition" ref={containerRef}>
      <button
        className="button button-primary button-small add-condition-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        ref={buttonRef}
      >
        + Add condition
      </button>
      {isOpen ? (
        <div
          className="condition-menu"
          id={menuId}
          role="group"
          aria-label="Add condition"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
