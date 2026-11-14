export const THEMES = [
  { id: "nebula", name: "Nebula (original)" },
  { id: "notebook", name: "Field Notebook" },
  { id: "mission", name: "Mission Control" },
  { id: "swiss", name: "Swiss Data Lab" },
  { id: "observatory", name: "Earth Observatory" },
  { id: "blueprint", name: "Blueprint" },
  { id: "polar", name: "Polar" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "nebula";
export const THEME_EVENT = "meika-theme";

/** Runs before paint: ?theme=... wins, then localStorage, then the default. */
export const THEME_BOOT_SCRIPT = `(function(){try{var ids=${JSON.stringify(THEMES.map((t) => t.id))};var q=new URLSearchParams(location.search).get('theme');var s=null;try{s=localStorage.getItem('meika-theme')}catch(e){}var t=ids.indexOf(q)>=0?q:(ids.indexOf(s)>=0?s:'${DEFAULT_THEME}');document.documentElement.setAttribute('data-theme',t);if(q&&ids.indexOf(q)>=0){try{localStorage.setItem('meika-theme',q)}catch(e){}}}catch(e){}})();`;
