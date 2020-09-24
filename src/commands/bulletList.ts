import { CommandOption, EnterKey, TabKey } from "../types";
import { insertTextAtCursor, insertTextAtCursorFirstLine } from "../utils";

const generateSpace = (count: number) => {
  let i = 0;
  let text = ''
  while(i < count) {
    text += ' '
    i++
  }
  return text
}

export const bulletList = (target: HTMLTextAreaElement, option: CommandOption) => {
  const { line } = option
  const lineWithoutSpace = line.replace(/^(\s*)/g, '');
  const spaces = line.match(/^(\s*)/)
  let spaceLength = 0
  if (spaces.length) {
    const [_, space] = spaces
    if (space) {
      spaceLength = space.length
    }
  }
  if (!lineWithoutSpace.startsWith('-')) {
    return false
  }
  if (option.code === EnterKey && !option.composing && lineWithoutSpace.length > 2) {
    const text = `\n${generateSpace(spaceLength)}- `
    insertTextAtCursor(target, text);
    target.setSelectionRange(option.start + text.length, option.start + text.length);
    return true
  } else if (option.code === TabKey && option.shiftKey) {
    // todo
  } else if (option.code === TabKey) {
    const text = '  '
    insertTextAtCursorFirstLine(target, text);
    target.setSelectionRange(option.start + text.length, option.start + text.length);
    return true
  }
  return false
}
