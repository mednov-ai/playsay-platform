import type { ReactNode } from "react";

export function RenderedMarkdown({ className, value }: { className?: string; value?: string | null }) {
  const text = normalizeMarkdownText(value);
  if (!text) {
    return null;
  }

  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const children = renderMarkdownInline(heading[2], `heading-${index}`);
      nodes.push(heading[1].length === 1
        ? <h5 key={`heading-${index}`}>{children}</h5>
        : <h6 key={`heading-${index}`}>{children}</h6>);
      index += 1;
      continue;
    }

    const unorderedItems: string[] = [];
    while (index < lines.length) {
      const match = /^\s*[-*]\s+(.+)$/.exec(lines[index]);
      if (!match) {
        break;
      }
      unorderedItems.push(match[1]);
      index += 1;
    }
    if (unorderedItems.length > 0) {
      nodes.push(
        <ul key={`ul-${index}`}>
          {unorderedItems.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderMarkdownInline(item, `ul-${index}-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const orderedItems: string[] = [];
    while (index < lines.length) {
      const match = /^\s*\d+\.\s+(.+)$/.exec(lines[index]);
      if (!match) {
        break;
      }
      orderedItems.push(match[1]);
      index += 1;
    }
    if (orderedItems.length > 0) {
      nodes.push(
        <ol key={`ol-${index}`}>
          {orderedItems.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderMarkdownInline(item, `ol-${index}-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (!currentTrimmed || /^(#{1,3})\s+/.test(currentTrimmed) || /^\s*[-*]\s+/.test(current) || /^\s*\d+\.\s+/.test(current)) {
        break;
      }
      paragraphLines.push(currentTrimmed);
      index += 1;
    }
    nodes.push(<p key={`p-${index}`}>{renderMarkdownLineBreaks(paragraphLines, `p-${index}`)}</p>);
  }

  return <div className={mergeClassName("playsay-markdown", className)}>{nodes}</div>;
}

export function MarkdownInline({ className, value }: { className?: string; value?: string | null }) {
  const text = normalizeMarkdownText(value);
  if (!text) {
    return null;
  }

  return <span className={mergeClassName("playsay-markdown-inline", className)}>{renderMarkdownInline(text)}</span>;
}

function normalizeMarkdownText(value?: string | null): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function mergeClassName(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

function renderMarkdownLineBreaks(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, index) => {
    const nodes = renderMarkdownInline(line, `${keyPrefix}-${index}`);
    return index === lines.length - 1 ? nodes : [...nodes, <br key={`${keyPrefix}-br-${index}`} />];
  });
}

function renderMarkdownInline(value: string, keyPrefix = "inline"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = "";
  let index = 0;
  let nodeIndex = 0;

  function pushText() {
    if (!buffer) {
      return;
    }
    nodes.push(buffer);
    buffer = "";
  }

  while (index < value.length) {
    if (value[index] === "`") {
      const end = value.indexOf("`", index + 1);
      if (end > index + 1) {
        pushText();
        nodes.push(<code key={`${keyPrefix}-code-${nodeIndex}`}>{value.slice(index + 1, end)}</code>);
        nodeIndex += 1;
        index = end + 1;
        continue;
      }
    }

    if (value.startsWith("**", index)) {
      const end = value.indexOf("**", index + 2);
      if (end > index + 2) {
        pushText();
        nodes.push(
          <strong key={`${keyPrefix}-strong-${nodeIndex}`}>
            {renderMarkdownInline(value.slice(index + 2, end), `${keyPrefix}-strong-${nodeIndex}`)}
          </strong>,
        );
        nodeIndex += 1;
        index = end + 2;
        continue;
      }
    }

    if (value[index] === "*" && value[index + 1] !== "*") {
      const end = value.indexOf("*", index + 1);
      if (end > index + 1) {
        pushText();
        nodes.push(
          <em key={`${keyPrefix}-em-${nodeIndex}`}>
            {renderMarkdownInline(value.slice(index + 1, end), `${keyPrefix}-em-${nodeIndex}`)}
          </em>,
        );
        nodeIndex += 1;
        index = end + 1;
        continue;
      }
    }

    buffer += value[index];
    index += 1;
  }

  pushText();
  return nodes;
}
