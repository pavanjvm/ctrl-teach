"use client";

import { useEffect, useRef } from "react";

export default function InlineTextField({
  value,
  onChange,
  ariaLabel,
  multiline = false,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  multiline?: boolean;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!multiline || !textareaRef.current) return;
    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 34)}px`;
  }, [multiline, value]);

  if (multiline) {
    return (
      <textarea
        ref={textareaRef}
        className={`admin-inline-field admin-inline-textarea ${className}`}
        value={value}
        aria-label={ariaLabel}
        rows={1}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      className={`admin-inline-field ${className}`}
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
