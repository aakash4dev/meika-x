import { Fragment } from "react";

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const safe = (url: string) => /^https?:\/\//.test(url) || (url.startsWith("/") && !url.startsWith("//"));

/** Renders agent text with inline [label](url) data links. Unknown schemes are shown as plain text. */
export default function RichText({ text, className }: { text: string; className?: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(LINK)) {
    const [whole, label, url] = m;
    const i = m.index ?? 0;
    if (i > last) out.push(<Fragment key={k++}>{text.slice(last, i)}</Fragment>);
    out.push(
      safe(url) ? (
        <a key={k++} href={url} target="_blank" rel="noreferrer noopener" title={url}>
          {label}
        </a>
      ) : (
        <Fragment key={k++}>{label}</Fragment>
      ),
    );
    last = i + whole.length;
  }
  if (last < text.length) out.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return <span className={`rt ${className ?? ""}`}>{out}</span>;
}
