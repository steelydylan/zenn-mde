import React from "react";
import highlight from "highlight.js/lib/core";
import markdown from "highlight.js/lib/languages/markdown";
import { Command, Decoration, Target } from "../types";
import { getCurrentLine, insertTextAtCursor } from "../utils";
import { SafeHTML } from "./SafeHTML";
import { useEmitter, useSubscriber } from "../hooks";

import { UndoRedo } from "../utils/undo-redo";

highlight.registerLanguage("markdown", markdown);

type Props = {
  onChange: (value: string) => void;
  commands: Command[];
  decorations: Decoration[];
  value: string;
  scrollMapping: Record<string, string>;
};

const xssAllowOption = {
  whiteList: {
    span: ["class"],
  },
};

const convertMarkdown = (md: string, decorations: Decoration[]) => {
  let text = md;
  if (text.endsWith("\n")) {
    text = `${text} `;
  }
  const { value: result } = highlight.highlight("markdown", text);
  return result.replace(
    /(<\s*span[^>]*>)(([\n\r\t]|.)*?)(<\s*\/\s*span>)/g,
    (_match, p1, p2, _p3, p4) => {
      let value = p2;
      const [_, className] = p1.match(/class="(.*)?"/);
      decorations.forEach((decoration) => {
        value = decoration(value, className);
      });
      return `${p1}${value}${p4}`;
    }
  );
};

export const convertElementToTarget = ({ result, target, top }: {
  result: HTMLElement, 
  target: HTMLPreElement, 
  top: number
}) => {
  const elements = Array.from(target.querySelectorAll(`.${result.className}`))
  return {
    selector: `.${result.className}`,
    text: result.textContent,
    index: elements.indexOf(result),
    top: result.getBoundingClientRect().top - top,
  }
}

export const getTargetElement = (
  target: HTMLPreElement,
  scrollMapping: Record<string, string>
) => {
  const targetRect = target.getBoundingClientRect();
  const { top, bottom } = targetRect;
  const children = target.querySelectorAll("span");
  const result = [].find.call(children, (child: HTMLElement) => {
    const rect = child.getBoundingClientRect();
    if (rect.bottom >= top && rect.top <= bottom && Object.keys(scrollMapping).some(key => child.matches(key))) {
      return true;
    }
    return false;
  }) as HTMLElement | null;
  if (result) {
    return convertElementToTarget({ result, target, top })
  }
  const results = Array.from(children).filter(child => Object.keys(scrollMapping).some(key => child.matches(key)) 
  ).sort((a: HTMLElement, b: HTMLElement) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    const minA = Math.min(Math.abs(rectA.bottom - top), Math.abs(rectA.top - bottom))
    const minB = Math.min(Math.abs(rectB.bottom - top), Math.abs(rectB.top - bottom))
    if (minA < minB) {
      return -1
    } 
    return 1
  })
  if (results[0]) {
    return convertElementToTarget({ result: results[0], target, top })
  }
  return null;
};

export const Textarea: React.FC<Props> = ({
  onChange,
  commands,
  decorations,
  value: markdown,
  scrollMapping,
}) => {
  // const [markdown, setMarkdown] = React.useState(value);
  const [composing, setComposing] = React.useState(false);
  const htmlRef = React.useRef<HTMLTextAreaElement>();
  const oldScrollRef = React.useRef<number>(0);
  const historyManager = React.useRef(
    new UndoRedo({
      markdown,
      selectionStart: 0,
      selectionEnd: 0,
    })
  );
  const psudoRef = React.useMemo(() => React.createRef<HTMLPreElement>(), []);
  const emit = useEmitter();
  const handleTextareaScroll = React.useCallback(() => {
    const { offsetHeight, scrollHeight, scrollTop } = htmlRef.current
    const scrollDiff = scrollTop - oldScrollRef.current;
    oldScrollRef.current = scrollTop;
    psudoRef.current.scrollTo(0, scrollTop);
    const result = getTargetElement(
      psudoRef.current,
      scrollMapping
    );
    emit({ type: "scroll", target: result, scrollDiff, scrollTop, scrollHeight, offsetHeight });
  }, []);

  const handleTextChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      e.target.scrollTo(0, oldScrollRef.current)
      onChange(e.target.value);
    },
    []
  );

  const handleCompositionStart = React.useCallback(() => {
    setComposing(true);
  }, []);

  const handleCompositionEnd = React.useCallback(() => {
    setComposing(false);
  }, []);

  const undo = () => {
    if (!historyManager.current.canUndo()) {
      return;
    }
    historyManager.current.undo();
    const {
      markdown: undoMarkdown,
      selectionStart,
      selectionEnd,
    } = historyManager.current.getValue();
    htmlRef.current.value = undoMarkdown;
    htmlRef.current.setSelectionRange(selectionStart, selectionEnd);
    onChange(undoMarkdown);
  };

  const redo = () => {
    if (!historyManager.current.canRedo()) {
      return;
    }
    historyManager.current.redo();
    const {
      markdown: redoMarkdown,
      selectionStart,
      selectionEnd,
    } = historyManager.current.getValue();
    htmlRef.current.value = redoMarkdown;
    htmlRef.current.setSelectionRange(selectionStart, selectionEnd);
    onChange(redoMarkdown);
  };

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.target as HTMLTextAreaElement;
      const line = getCurrentLine(textarea);
      const { value } = textarea;
      const code = e.key;
      const { shiftKey, metaKey, ctrlKey } = e;
      const start = textarea.selectionStart!;
      const end = textarea.selectionEnd!;
      commands.forEach((command) => {
        const result = command(textarea, {
          line,
          value,
          code,
          shiftKey,
          start,
          end,
          composing,
          metaKey,
          ctrlKey,
          emit,
        });
        if (result?.stop) {
          e.preventDefault();
        }
        if (result?.change) {
          onChange(textarea.value);
        }
      });
    },
    [composing]
  );

  useSubscriber((event) => {
    const target = htmlRef.current;
    if (event.type === "insert") {
      const { text } = event;
      const start = target.selectionStart!;
      insertTextAtCursor(htmlRef.current, text);
      target.setSelectionRange(start + text.length, start + text.length);
      onChange(target.value);
    } else if (event.type === "replace") {
      const { text, targetText } = event;
      const currentSelection = target.selectionStart;
      const offset = targetText.length - text.length;
      target.value = target.value.replace(targetText, text);
      target.setSelectionRange(
        currentSelection + offset,
        currentSelection + offset
      );
      onChange(target.value);
    } else if (event.type === "undo") {
      undo();
    } else if (event.type === "redo") {
      redo();
    }
  });

  React.useEffect(() => {
    historyManager.current.push({
      markdown,
      selectionStart: htmlRef.current.selectionStart,
      selectionEnd: htmlRef.current.selectionStart,
    });
  }, [markdown]);

  return (
    <div className="zenn-mde-textarea-wrap">
      <SafeHTML
        options={xssAllowOption}
        ref={psudoRef}
        className="zenn-mde-psudo"
        tagName="pre"
        html={convertMarkdown(markdown, decorations)}
      />
      <textarea
        ref={htmlRef}
        className="zenn-mde-textarea"
        spellCheck={false}
        onScroll={handleTextareaScroll}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        value={markdown}
      />
    </div>
  );
};
