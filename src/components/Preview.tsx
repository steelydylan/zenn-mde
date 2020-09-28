import * as React from "react";
import morphdom from "morphdom";
import { parser as defaultParser } from "../parser";
import { Target } from "../types";
import { useSubscriber } from "../hooks";

type Props = {
  value: string;
  className?: string;
  parser: (text: string) => string;
  callback: Record<string, (node: any) => any>;
  scrollMapping: Record<string, string>;
};

export const Preview: React.FC<Props> = ({
  value,
  className,
  parser,
  callback,
  scrollMapping,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);

  useSubscriber((event) => {
    if (event.type !== "scroll") {
      return;
    }
    const parent = ref.current.parentNode as HTMLElement;
    if (!event.target) {
      if (event.scrollPercent === 1) {
        parent.scrollTo(0, parent.scrollHeight);
      } else {
        parent.scrollTo(0, parent.scrollTop + event.scrollDiff);
      }
      return;
    }
    const selector = scrollMapping[event.target.selector];
    if (!selector) {
      return;
    }
    const children = ref.current.querySelectorAll(`${selector}`);
    const child = children[event.target.index] as HTMLElement;
    if (!child) {
      return;
    }
    parent.scrollTo(
      0,
      child.offsetTop -
        parent.offsetHeight +
        event.scrollPercent * child.offsetHeight +
        parent.offsetHeight * (1 - event.scrollPercent)
    );
  });

  React.useEffect(() => {
    try {
      const html = parser ? parser(value) : defaultParser(value);
      morphdom(
        ref.current,
        `<div class="${className}">${html}</div>`,
        callback
      );
      // return parser ? parser(value) : defaultParser(value)
    } catch (e) {
      console.log(e);
    }
  }, [value]);

  return <div ref={ref} className={className} />;
};
