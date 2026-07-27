import React from "react";

/**
 * Renders a translated sentence that has JSX inside it.
 *
 * Plenty of sentences in this product wrap part of themselves in an element: a
 * <code> chip around an IAM action, a <strong> around a console path, an inline
 * <button> that jumps to a tab, a tabular-numeral <span> around an amount. The
 * usual shortcut is to cut the sentence at each element boundary and keep the
 * pieces as separate keys, which hard-codes Spanish word order into the
 * component: "(solo {code})" and "({code} only)" put the chip on opposite sides,
 * and a translator handed three fragments cannot fix that.
 *
 * So the whole sentence stays one dictionary key, with a {marker} where the
 * element goes — the same marker syntax translate.ts already uses for values —
 * and this component substitutes nodes instead of strings.
 *
 * An unknown marker is left verbatim, matching interpolate()'s policy: the bug
 * shows up on screen instead of rendering as nothing.
 *
 * Plain module, no "use client": it holds no state and no hooks, so it inherits
 * the boundary of whichever component imports it.
 */
export function RichText({
  template,
  nodes,
}: {
  template: string;
  nodes: Record<string, React.ReactNode>;
}) {
  // The capturing group keeps the markers in the output of split().
  const parts = template.split(/(\{\w+\})/g);

  return (
    <>
      {parts.map((part, i) => {
        const marker = /^\{(\w+)\}$/.exec(part);
        const content = marker && marker[1] in nodes ? nodes[marker[1]] : part;
        return <React.Fragment key={i}>{content}</React.Fragment>;
      })}
    </>
  );
}
