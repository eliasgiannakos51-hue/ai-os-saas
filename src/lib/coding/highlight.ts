/**
 * SYNTAX HIGHLIGHTING THAT CANNOT INJECT ANYTHING.
 *
 * WHY THIS IS NOT A LIBRARY. Every mainstream highlighter's primary API
 * returns an HTML STRING, which a React component then has to render with
 * `dangerouslySetInnerHTML`. That is a call to inject markup built from
 * text a user pasted, on a page inside their session, and its safety
 * depends entirely on the library escaping every character correctly in
 * every language mode, forever. A highlighting bug becomes an XSS.
 *
 * This returns TOKENS. The component maps them to `<span>` elements, so
 * the user's code goes through React's normal text escaping like any
 * other string and there is no path — not a bug in this file, not a
 * language mode nobody tested — by which pasted text becomes markup.
 *
 * WHAT IT GIVES UP, honestly: it is a lexer, not a parser. It does not
 * know that a name is a type rather than a variable, it will colour a
 * keyword used as a property name, and it has no idea about JSX,
 * template-literal interpolation or nested languages. Highlighting that
 * is imperfect is a cosmetic fault; highlighting that is a security
 * boundary is not a trade worth making for prettier output.
 *
 * Pure. No DOM, no React.
 */

export const TOKEN_KINDS = ["plain", "comment", "string", "number", "keyword", "builtin", "punctuation"] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];
export type Token = { kind: TokenKind; text: string };

type Dialect = {
  keywords: Set<string>;
  builtins: Set<string>;
  lineComment: string[];
  blockComment: [string, string][];
  /** Quote characters that start a string. */
  quotes: string[];
  /** Python's triple quotes, PHP's heredoc… only the first is supported. */
  tripleQuotes: boolean;
};

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));

const C_LIKE = {
  lineComment: ["//"],
  blockComment: [["/*", "*/"]] as [string, string][],
  quotes: ['"', "'", "`"],
  tripleQuotes: false,
};

const DIALECTS: Record<string, Dialect> = {
  typescript: {
    ...C_LIKE,
    keywords: words(`abstract as async await break case catch class const continue declare default delete do else
      enum export extends finally for from function get if implements import in instanceof interface keyof let new of
      private protected public readonly return satisfies set static super switch this throw try type typeof var void
      while yield`),
    builtins: words(`Array Boolean Date Error JSON Map Math Number Object Promise RegExp Set String Symbol
      console null true false undefined NaN Infinity any unknown never string number boolean object bigint`),
  },
  javascript: {
    ...C_LIKE,
    keywords: words(`async await break case catch class const continue default delete do else export extends finally
      for from function get if import in instanceof let new of return set static super switch this throw try typeof
      var void while yield`),
    builtins: words(`Array Boolean Date Error JSON Map Math Number Object Promise RegExp Set String Symbol
      console null true false undefined NaN Infinity`),
  },
  python: {
    lineComment: ["#"],
    blockComment: [],
    quotes: ['"', "'"],
    tripleQuotes: true,
    keywords: words(`and as assert async await break class continue def del elif else except finally for from global
      if import in is lambda nonlocal not or pass raise return try while with yield match case`),
    builtins: words(`True False None self len range print dict list set tuple int float str bool open enumerate zip
      map filter sum min max sorted any all isinstance super Exception ValueError TypeError KeyError`),
  },
  go: {
    ...C_LIKE,
    quotes: ['"', "`"],
    keywords: words(`break case chan const continue default defer else fallthrough for func go goto if import
      interface map package range return select struct switch type var`),
    builtins: words(`append cap close complex copy delete int int8 int16 int32 int64 uint uintptr float32 float64
      string bool byte rune error len make new nil panic print println recover true false iota`),
  },
  rust: {
    ...C_LIKE,
    quotes: ['"'],
    keywords: words(`as async await break const continue crate dyn else enum extern fn for if impl in let loop match
      mod move mut pub ref return self Self static struct super trait type unsafe use where while`),
    builtins: words(`bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize String Vec Option
      Some None Result Ok Err Box true false println panic`),
  },
  java: {
    ...C_LIKE,
    quotes: ['"', "'"],
    keywords: words(`abstract assert break case catch class const continue default do else enum extends final finally
      for goto if implements import instanceof interface native new package private protected public return static
      strictfp super switch synchronized this throw throws transient try void volatile while var record sealed`),
    builtins: words(`boolean byte char double float int long short String Object List Map Set Integer Double Boolean
      System true false null`),
  },
  csharp: {
    ...C_LIKE,
    quotes: ['"', "'"],
    keywords: words(`abstract as async await base break case catch class const continue default delegate do else enum
      event explicit extern finally fixed for foreach get goto if implicit in interface internal is lock namespace new
      operator out override params private protected public readonly ref return sealed set sizeof stackalloc static
      struct switch this throw try typeof unchecked unsafe using virtual void volatile while record`),
    builtins: words(`bool byte char decimal double float int long object sbyte short string uint ulong ushort var
      dynamic true false null Console List Dictionary Task`),
  },
  php: {
    lineComment: ["//", "#"],
    blockComment: [["/*", "*/"]],
    quotes: ['"', "'"],
    tripleQuotes: false,
    keywords: words(`abstract and array as break callable case catch class clone const continue declare default do
      echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for
      foreach function global goto if implements include include_once instanceof insteadof interface isset list match
      namespace new or print private protected public readonly require require_once return static switch throw trait
      try unset use var while xor yield`),
    builtins: words(`true false null int float string bool object mixed void never self parent this`),
  },
  ruby: {
    lineComment: ["#"],
    blockComment: [],
    quotes: ['"', "'"],
    tripleQuotes: false,
    keywords: words(`alias and begin break case class def defined do else elsif end ensure for if in module next nil
      not or redo rescue retry return self super then unless until when while yield require attr_accessor`),
    builtins: words(`true false nil puts print Array Hash String Integer Float Symbol Proc Struct raise`),
  },
  sql: {
    lineComment: ["--"],
    blockComment: [["/*", "*/"]],
    quotes: ["'", '"'],
    tripleQuotes: false,
    keywords: words(`select from where group by having order limit offset insert into values update set delete join
      inner left right full outer on as union all distinct create table alter drop index view with returning case when
      then else end and or not null is in between like exists primary key foreign references default check unique
      constraint grant revoke begin commit rollback`),
    builtins: words(`int integer bigint smallint text varchar char boolean date timestamp timestamptz uuid jsonb json
      numeric decimal real double count sum avg min max coalesce now true false`),
  },
  bash: {
    lineComment: ["#"],
    blockComment: [],
    quotes: ['"', "'"],
    tripleQuotes: false,
    keywords: words(`if then elif else fi for while until do done case esac function in select return break continue
      local export readonly declare source exit trap set unset shift`),
    builtins: words(`echo cd ls cat grep sed awk cut sort uniq head tail wc find xargs mkdir rm cp mv chmod curl git
      npm node true false`),
  },
  json: {
    lineComment: [],
    blockComment: [],
    quotes: ['"'],
    tripleQuotes: false,
    keywords: new Set<string>(),
    builtins: words("true false null"),
  },
  css: {
    lineComment: [],
    blockComment: [["/*", "*/"]],
    quotes: ['"', "'"],
    tripleQuotes: false,
    keywords: words(`import media supports keyframes font-face charset namespace layer container`),
    builtins: words(`color background display flex grid margin padding border width height position top right bottom
      left font transform transition opacity z-index inherit initial unset none auto`),
  },
  html: {
    lineComment: [],
    blockComment: [["<!--", "-->"]],
    quotes: ['"', "'"],
    tripleQuotes: false,
    keywords: words(`html head body div span p a img ul ol li table tr td th form input button script style link meta
      title header footer nav section article aside h1 h2 h3 h4 h5 h6`),
    builtins: words(`class id href src type value name style rel alt width height placeholder`),
  },
};

/** Anything we do not have a dialect for is still tokenised — strings,
 *  numbers and C-style comments are near-universal — rather than
 *  rendered flat. A wrong keyword colour is worse than none, so the
 *  fallback claims no keywords at all. */
const FALLBACK: Dialect = { ...C_LIKE, keywords: new Set(), builtins: new Set(), lineComment: ["//", "#"] };

export function dialectFor(language: string | null | undefined): Dialect {
  const key = String(language ?? "").trim().toLowerCase();
  return DIALECTS[key] ?? FALLBACK;
}

/** Nothing longer than this is highlighted — it is rendered plain. A
 *  200KB paste tokenised character by character on the main thread is a
 *  frozen tab, and a frozen tab is worse than grey code. */
export const MAX_HIGHLIGHT_CHARS = 100_000;

export function highlight(code: string, language?: string | null): Token[] {
  if (code.length > MAX_HIGHLIGHT_CHARS) return [{ kind: "plain", text: code }];
  const dialect = dialectFor(language);
  const tokens: Token[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      tokens.push({ kind: "plain", text: buffer });
      buffer = "";
    }
  };
  const push = (kind: TokenKind, text: string) => {
    flush();
    tokens.push({ kind, text });
  };

  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);

    // Block comments first: `/* // */` is one comment, and checking line
    // comments first would end it at the wrong place.
    const block = dialect.blockComment.find(([open]) => rest.startsWith(open));
    if (block) {
      const [open, close] = block;
      const end = code.indexOf(close, i + open.length);
      const stop = end === -1 ? code.length : end + close.length;
      push("comment", code.slice(i, stop));
      i = stop;
      continue;
    }

    const line = dialect.lineComment.find((marker) => rest.startsWith(marker));
    if (line) {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      push("comment", code.slice(i, stop));
      i = stop;
      continue;
    }

    if (dialect.tripleQuotes && (rest.startsWith('"""') || rest.startsWith("'''"))) {
      const marker = rest.slice(0, 3);
      const end = code.indexOf(marker, i + 3);
      const stop = end === -1 ? code.length : end + 3;
      push("string", code.slice(i, stop));
      i = stop;
      continue;
    }

    const quote = dialect.quotes.find((q) => rest.startsWith(q));
    if (quote) {
      let j = i + 1;
      // AN UNTERMINATED STRING ENDS AT THE LINE, not at the end of the
      // file. A stray apostrophe in a comment — "don't" — would otherwise
      // paint the rest of the paste as one string.
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === quote) {
          j++;
          break;
        }
        if (code[j] === "\n" && quote !== "`") {
          break;
        }
        j++;
      }
      push("string", code.slice(i, Math.min(j, code.length)));
      i = Math.min(j, code.length);
      continue;
    }

    const ch = code[i];

    if (/[0-9]/.test(ch) && !/[A-Za-z_$]/.test(code[i - 1] ?? "")) {
      const match = rest.match(/^0[xXbBoO][0-9a-fA-F_]+|^\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d+)?/);
      if (match) {
        push("number", match[0]);
        i += match[0].length;
        continue;
      }
    }

    if (/[A-Za-z_$@#]/.test(ch)) {
      const match = rest.match(/^[A-Za-z_$@#][\w$-]*/);
      if (match) {
        const word = match[0];
        const bare = word.replace(/^[@#$]/, "");
        const kind: TokenKind = dialect.keywords.has(bare)
          ? "keyword"
          : dialect.builtins.has(bare)
            ? "builtin"
            : "plain";
        if (kind === "plain") buffer += word;
        else push(kind, word);
        i += word.length;
        continue;
      }
    }

    if (/[{}()[\];,.:<>=+\-*/%!&|^~?]/.test(ch)) {
      push("punctuation", ch);
      i++;
      continue;
    }

    buffer += ch;
    i++;
  }

  flush();
  return tokens;
}

/**
 * A guess at the language of a paste, for when the user has not said.
 *
 * DELIBERATELY CONSERVATIVE: it returns null unless something is
 * distinctive. A wrong guess colours a Python file as SQL, which is more
 * confusing than no colour, and the user can always pick from the list.
 */
export function guessLanguage(code: string): string | null {
  const sample = code.slice(0, 4_000);
  if (/^\s*<\?php\b/.test(sample)) return "php";
  if (/^\s*<(!doctype html|html)\b/i.test(sample)) return "html";
  if (/^\s*#!.*\b(bash|sh|zsh)\b/.test(sample)) return "bash";
  if (/^\s*(def |class |import |from )\S+.*:\s*$/m.test(sample)) return "python";
  if (/\bfunc\s+\w+\s*\([^)]*\)\s*\w*\s*\{/.test(sample) && /\bpackage\s+\w+/.test(sample)) return "go";
  if (/\bfn\s+\w+\s*\(/.test(sample) && /\blet\s+mut\b/.test(sample)) return "rust";
  if (/\b(interface|type)\s+\w+\s*[={]/.test(sample) && /:\s*(string|number|boolean)\b/.test(sample)) return "typescript";
  if (/\b(select|insert into|update|delete from|create table)\b/i.test(sample) && /\bfrom\b|\bvalues\b|\bset\b/i.test(sample)) return "sql";
  if (/\b(const|let|function|=>)\b/.test(sample)) return "javascript";
  try {
    const trimmed = sample.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && JSON.parse(code)) return "json";
  } catch {
    // Not JSON. Falls through to null, which is the honest answer.
  }
  return null;
}
