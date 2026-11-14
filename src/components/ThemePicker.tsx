"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, THEMES, THEME_EVENT } from "@/lib/themes";

export default function ThemePicker() {
  const [theme, setTheme] = useState<string>(DEFAULT_THEME);
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") ?? DEFAULT_THEME);
  }, []);
  return (
    <select
      aria-label="Theme"
      value={theme}
      onChange={(e) => {
        const t = e.target.value;
        setTheme(t);
        document.documentElement.setAttribute("data-theme", t);
        try {
          localStorage.setItem("meika-theme", t);
        } catch {
          /* storage may be blocked */
        }
        window.dispatchEvent(new Event(THEME_EVENT));
      }}
    >
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
