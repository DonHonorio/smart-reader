const SEMANTIC_BLOCK_TAGS = new Set([
  "P",
  "LI",
  "BLOCKQUOTE",
  "DIV",
  "SECTION",
  "ARTICLE",
  "BODY",
]);

const SENTENCE_DELIMITERS = new Set([".", "?", "!", ";", ":"]);
const OPENING_WRAPPERS = new Set(["\"", "'", "(", "[", "{"]);
const CLOSING_WRAPPERS = new Set(["\"", "'", ")", "]", "}"]);

const MAX_CONTEXT_WORDS = 250;
const MAX_CONTEXT_CHARS = 1000;

export type ExtractedSelectionContext = {
  selectedText: string;
  contextSentence: string | null;
};

function normalizeWhitespace(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSelectedText(value: string) {
  return normalizeWhitespace(value);
}

export function normalizeContextText(value: string) {
  return normalizeWhitespace(value)
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function getWordCount(value: string) {
  if (!value) {
    return 0;
  }

  return value.split(/\s+/).filter(Boolean).length;
}

function isTooLong(value: string) {
  return value.length > MAX_CONTEXT_CHARS || getWordCount(value) > MAX_CONTEXT_WORDS;
}

function getRangeFromSelection(selection: Selection) {
  if (selection.rangeCount === 0) {
    return null;
  }

  try {
    return selection.getRangeAt(0);
  } catch {
    return null;
  }
}

function getClosestElement(node: Node) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as Element;
  }

  return node.parentElement;
}

function findSemanticBlock(startElement: Element) {
  let current: Element | null = startElement;

  while (current) {
    if (SEMANTIC_BLOCK_TAGS.has(current.tagName.toUpperCase())) {
      return current;
    }

    current = current.parentElement;
  }

  return startElement.ownerDocument?.body ?? startElement;
}

function findSelectedIndex(text: string, selectedText: string) {
  const exactMatchIndex = text.indexOf(selectedText);

  if (exactMatchIndex >= 0) {
    return exactMatchIndex;
  }

  return text.toLocaleLowerCase().indexOf(selectedText.toLocaleLowerCase());
}

function findSentenceStart(text: string, selectedIndex: number) {
  for (let index = selectedIndex - 1; index >= 0; index -= 1) {
    if (SENTENCE_DELIMITERS.has(text[index])) {
      let sentenceStart = index + 1;

      while (
        sentenceStart < text.length &&
        (text[sentenceStart] === " " || OPENING_WRAPPERS.has(text[sentenceStart]))
      ) {
        sentenceStart += 1;
      }

      return sentenceStart;
    }
  }

  return 0;
}

function findSentenceEnd(text: string, selectedEndIndex: number) {
  for (let index = selectedEndIndex; index < text.length; index += 1) {
    if (SENTENCE_DELIMITERS.has(text[index])) {
      let sentenceEnd = index + 1;

      while (
        sentenceEnd < text.length &&
        (text[sentenceEnd] === " " || CLOSING_WRAPPERS.has(text[sentenceEnd]))
      ) {
        sentenceEnd += 1;
      }

      return sentenceEnd;
    }
  }

  return text.length;
}

function buildContextWindow(text: string, selectedStart: number, selectedEnd: number) {
  const wordMatches = Array.from(text.matchAll(/\S+/g));

  if (wordMatches.length === 0) {
    return text.slice(0, MAX_CONTEXT_CHARS).trim();
  }

  let anchorWordIndex = wordMatches.findIndex((match) => {
    const wordStart = match.index ?? 0;
    const wordEnd = wordStart + match[0].length;

    return selectedStart < wordEnd && selectedEnd > wordStart;
  });

  if (anchorWordIndex < 0) {
    anchorWordIndex = wordMatches.findIndex((match) => (match.index ?? 0) >= selectedStart);
  }

  if (anchorWordIndex < 0) {
    anchorWordIndex = wordMatches.length - 1;
  }

  const halfWindow = Math.floor((MAX_CONTEXT_WORDS - 1) / 2);
  const startWord = Math.max(0, anchorWordIndex - halfWindow);
  const endWord = Math.min(wordMatches.length - 1, anchorWordIndex + halfWindow);

  const windowStart = wordMatches[startWord].index ?? 0;
  const windowEnd = (wordMatches[endWord].index ?? 0) + wordMatches[endWord][0].length;
  const wordWindow = text.slice(windowStart, windowEnd).trim();

  if (wordWindow.length <= MAX_CONTEXT_CHARS) {
    return wordWindow;
  }

  const selectedLength = Math.max(1, selectedEnd - selectedStart);
  const sideRoom = Math.max(0, MAX_CONTEXT_CHARS - selectedLength);

  let charStart = Math.max(0, selectedStart - Math.floor(sideRoom / 2));
  let charEnd = Math.min(text.length, charStart + MAX_CONTEXT_CHARS);

  if (charEnd - charStart < MAX_CONTEXT_CHARS) {
    charStart = Math.max(0, charEnd - MAX_CONTEXT_CHARS);
  }

  const startBoundary = text.lastIndexOf(" ", charStart);

  if (startBoundary >= 0 && startBoundary < selectedStart) {
    charStart = startBoundary + 1;
  }

  const endBoundary = text.indexOf(" ", charEnd);

  if (endBoundary > selectedEnd) {
    charEnd = endBoundary;
  }

  return text.slice(charStart, Math.min(charEnd, text.length)).trim();
}

function buildFallbackContext(text: string) {
  let fallback = text;

  const words = fallback.split(/\s+/).filter(Boolean);

  if (words.length > MAX_CONTEXT_WORDS) {
    fallback = words.slice(0, MAX_CONTEXT_WORDS).join(" ");
  }

  if (fallback.length > MAX_CONTEXT_CHARS) {
    const sliced = fallback.slice(0, MAX_CONTEXT_CHARS);
    const safeBoundary = sliced.lastIndexOf(" ");

    fallback =
      safeBoundary >= Math.floor(MAX_CONTEXT_CHARS * 0.6)
        ? sliced.slice(0, safeBoundary)
        : sliced;
  }

  fallback = fallback.trim();
  return fallback || null;
}

function extractContextFromBlock(blockText: string, selectedText: string) {
  const selectedStart = findSelectedIndex(blockText, selectedText);

  if (selectedStart < 0) {
    return buildFallbackContext(blockText);
  }

  const selectedEnd = selectedStart + selectedText.length;
  const sentenceStart = findSentenceStart(blockText, selectedStart);
  const sentenceEnd = findSentenceEnd(blockText, selectedEnd);

  let candidate = blockText.slice(sentenceStart, sentenceEnd).trim();

  if (!candidate) {
    candidate = buildContextWindow(blockText, selectedStart, selectedEnd);
  }

  if (!candidate) {
    return buildFallbackContext(blockText);
  }

  if (isTooLong(candidate)) {
    candidate = buildContextWindow(blockText, selectedStart, selectedEnd);
  }

  return candidate || buildFallbackContext(blockText);
}

export function extractContextSentenceFromSelection(selection: Selection): ExtractedSelectionContext {
  const selectedText = normalizeSelectedText(selection.toString());

  if (!selectedText) {
    return {
      selectedText: "",
      contextSentence: null,
    };
  }

  const range = getRangeFromSelection(selection);

  if (!range) {
    return {
      selectedText,
      contextSentence: null,
    };
  }

  const closestElement = getClosestElement(range.commonAncestorContainer);

  if (!closestElement) {
    return {
      selectedText,
      contextSentence: null,
    };
  }

  const semanticBlock = findSemanticBlock(closestElement);
  const normalizedBlockText = normalizeContextText(semanticBlock.textContent ?? "");

  if (!normalizedBlockText) {
    return {
      selectedText,
      contextSentence: null,
    };
  }

  return {
    selectedText,
    contextSentence: extractContextFromBlock(normalizedBlockText, selectedText),
  };
}