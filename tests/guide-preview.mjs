/**
 * The guide's three slideshows — the install steps, the Google Meet steps and
 * the slide-presentation steps — in a browser, in all ten languages.
 *
 *     node tests/guide-preview.mjs [en|ja|ar|…] [--no-open]
 *
 * GitHub Pages builds the guide, and nothing in this repository builds it here:
 * there is no Gemfile, and the Ruby that ships with macOS is too old to run a
 * Jekyll new enough to match Pages. So the one part of a guide page that is
 * markup rather than markdown gets its own preview, and the rest of the page —
 * which is markdown, and which renders the same everywhere — does not need one.
 *
 * What it is for is the part a diff cannot show: whether the tabs wrap, whether
 * a translated label is too long, whether the ring landed on the button, and
 * whether Arabic comes out mirrored. The stylesheet it loads is the published
 * site's own, because the theme's `.markdown-body` rules are half of what the
 * slideshow is laid out against — one of them is more specific than a single
 * class, and a preview that did not have them would not have caught it. That
 * needs a network, and it means the theme being previewed against is the one
 * Pages last built rather than the one in this checkout, which for a theme
 * nobody here edits is the closer of the two anyway.
 *
 * The strip along the top is the ten languages. It is part of the preview, not
 * part of the site.
 *
 * Below is a Liquid interpreter and a YAML reader, both small and both partial.
 * They exist because this repository has no dependencies and the alternative
 * was a pile of regular expressions that pretended to be one: the slideshow's
 * markup grew conditionals and lookups, a regular expression that "expands" a
 * conditional silently renders the wrong branch, and a preview that lies is
 * worse than no preview. What they cover is what these two files use, and an
 * eleventh construct is an error rather than a guess — see `SUPPORTED` below.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.join(import.meta.dirname, "..");
const SITE = path.join(ROOT, "docs");
const OUT = path.join(os.tmpdir(), "interpretab-guide-preview");

/** The guide's own stylesheet, off the published site — see the note above. */
const THEME = "https://kazunori279.github.io/interpretab/assets/css/style.css";

/** Every Liquid tag and filter the three templates are allowed to use. */
const SUPPORTED = {
  tags: [
    "comment", "assign", "if", "elsif", "else", "unless", "for",
    "endcomment", "endif", "endunless", "endfor",
  ],
  filters: ["default", "size", "split", "minus", "plus", "append", "replace", "relative_url"],
};

const args = process.argv.slice(2);
const open = !args.includes("--no-open");
const wanted = args.find((a) => /^[a-z]{2}$/.test(a)) || "en";

const data = {
  install: readData("install.yml"),
  meet: readData("meet.yml"),
  slides: readData("slides.yml"),
  shots: readData("shots.yml"),
  languages: readData("languages.yml"),
};
/** All three slideshows, one after the other, the way the guide page has them. */
const markup = ["install-steps.html", "meet-steps.html", "slide-steps.html"].map((file) =>
  fs.readFileSync(path.join(SITE, "_includes", file), "utf8")
);
const style = readStyle();

fs.mkdirSync(OUT, { recursive: true });
for (const language of data.languages) {
  fs.writeFileSync(path.join(OUT, `${language.code}.html`), preview(language));
  console.log(`   ok   ${path.join(OUT, `${language.code}.html`)}`);
}

const landing = path.join(OUT, `${wanted}.html`);
if (!fs.existsSync(landing)) throw new Error(`${wanted} is not one of the guide's languages`);
if (open) execFileSync("open", [landing]);
else console.log(`\n${landing}`);

/** One preview page: the language strip, the heading it sits under, the slideshow. */
function preview(language) {
  const scope = { site: { data }, page: { lang: language.code } };
  const strip = data.languages
    .map(
      (l) =>
        `<a href="./${l.code}.html"${l.code === language.code ? ' aria-current="page"' : ""}>${l.name}</a>`
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="${language.code}" dir="${language.code === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<title>Slideshows — ${language.name} (preview)</title>
<link rel="stylesheet" href="${THEME}">
<style>
  /* Not the site's language bar. This one says which preview you are looking at. */
  .preview-bar { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0.6rem 1rem; background: #1f2328; }
  .preview-bar a { color: #d0d7de; font-size: 0.85rem; text-decoration: none; }
  .preview-bar a[aria-current] { color: #fff; font-weight: 600; }
</style>
<style>${render(style, scope)}</style>
</head>
<body>
<nav class="preview-bar">${strip}</nav>
<!-- The wrapper is the one in _layouts/default.html, class for class. -->
<div class="container-lg px-3 my-5 markdown-body">
${markup.map((template) => render(template, scope)).join("\n<hr>\n")}
</div>
</body>
</html>
`;
}

/** The `<style>` out of `head-custom.html`, which is otherwise `<link>`s and a script. */
function readStyle() {
  const head = fs.readFileSync(path.join(SITE, "_includes", "head-custom.html"), "utf8");
  const style = head.match(/<style>([\s\S]*?)<\/style>/);
  if (!style) throw new Error("head-custom.html no longer has a <style> block in it");
  return style[1];
}

/** One file out of `docs/_data`, which is where Jekyll would have found it too. */
function readData(file) {
  return parseYaml(fs.readFileSync(path.join(SITE, "_data", file), "utf8"));
}

// --- Liquid ----------------------------------------------------------------

/** Text with the template's tags carried out against `scope`. */
function render(template, scope) {
  return emit(parse(lex(template)), { ...scope });
}

/**
 * Text, `{{ output }}` and `{% tag %}`, with Liquid's whitespace control
 * applied — a hyphen on a delimiter eats the whitespace on that side, and in
 * markup where every tag is on its own line that hyphen is the difference
 * between one blank line and thirty.
 */
function lex(template) {
  const parts = template.split(/(\{\{-?[\s\S]*?-?\}\}|\{%-?[\s\S]*?-?%\})/);
  const tokens = [];
  for (const part of parts) {
    if (part === "" || part === undefined) continue;
    if (part.startsWith("{{") || part.startsWith("{%")) {
      const tag = part.startsWith("{%");
      tokens.push({
        type: tag ? "tag" : "out",
        body: part.slice(2, -2).replace(/^-|-$/g, "").trim(),
        trimLeft: part[2] === "-",
        trimRight: part[part.length - 3] === "-",
      });
    } else {
      tokens.push({ type: "text", value: part });
    }
  }
  for (const [i, token] of tokens.entries()) {
    if (token.type === "text") continue;
    const before = tokens[i - 1];
    const after = tokens[i + 1];
    if (token.trimLeft && before?.type === "text") before.value = before.value.replace(/\s+$/, "");
    if (token.trimRight && after?.type === "text") after.value = after.value.replace(/^\s+/, "");
  }
  return tokens;
}

/** Tokens into a tree, so that a `for` knows what is inside it. */
function parse(tokens) {
  let at = 0;

  function block(until) {
    const nodes = [];
    while (at < tokens.length) {
      const token = tokens[at];
      if (token.type === "text") {
        nodes.push(token);
        at++;
        continue;
      }
      if (token.type === "out") {
        nodes.push(token);
        at++;
        continue;
      }
      const name = token.body.split(/\s+/)[0];
      if (!SUPPORTED.tags.includes(name)) throw new Error(`preview: unsupported Liquid tag {% ${name} %}`);
      if (until.includes(name)) return nodes;
      at++;

      if (name === "comment") {
        while (at < tokens.length && tokens[at].body !== "endcomment") at++;
        at++;
      } else if (name === "assign") {
        const [, target, expression] = token.body.match(/^assign\s+(\w+)\s*=\s*([\s\S]+)$/);
        nodes.push({ type: "assign", target, expression });
      } else if (name === "if") {
        const branches = [{ when: token.body.slice(2).trim(), nodes: block(["elsif", "else", "endif"]) }];
        while (tokens[at] && tokens[at].body !== "endif") {
          const branch = tokens[at];
          at++;
          branches.push({
            when: branch.body.startsWith("elsif") ? branch.body.slice(5).trim() : null,
            nodes: block(["elsif", "else", "endif"]),
          });
        }
        at++;
        nodes.push({ type: "if", branches });
      } else if (name === "unless") {
        // No `else` arm: Liquid has one, and the slideshow has never wanted it.
        nodes.push({ type: "unless", when: token.body.slice(6).trim(), nodes: block(["endunless"]) });
        at++;
      } else if (name === "for") {
        const [, variable, expression] = token.body.match(/^for\s+(\w+)\s+in\s+([\s\S]+)$/);
        nodes.push({ type: "for", variable, expression, nodes: block(["endfor"]) });
        at++;
      }
    }
    return nodes;
  }

  return block([]);
}

/** The tree, into text. */
function emit(nodes, scope) {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") out += node.value;
    else if (node.type === "out") out += show(evaluate(node.body, scope));
    else if (node.type === "assign") scope[node.target] = evaluate(node.expression, scope);
    else if (node.type === "if") {
      for (const branch of node.branches) {
        if (branch.when === null || truthy(condition(branch.when, scope))) {
          out += emit(branch.nodes, scope);
          break;
        }
      }
    } else if (node.type === "unless") {
      if (!truthy(condition(node.when, scope))) out += emit(node.nodes, scope);
    } else if (node.type === "for") {
      const items = loopItems(node.expression, scope);
      for (const [i, item] of items.entries()) {
        out += emit(node.nodes, {
          ...scope,
          [node.variable]: item,
          forloop: { index: i + 1, index0: i, first: i === 0, last: i === items.length - 1 },
        });
      }
    }
  }
  return out;
}

/** `steps`, or a range like `(1..step_count)`. */
function loopItems(expression, scope) {
  const range = expression.match(/^\((.+)\.\.(.+)\)$/);
  if (range) {
    const from = Number(evaluate(range[1], scope));
    const to = Number(evaluate(range[2], scope));
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  const items = evaluate(expression, scope);
  return Array.isArray(items) ? items : [];
}

/** An `if`, which is either a comparison or a value that is there or is not. */
function condition(source, scope) {
  const comparison = source.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!comparison) return evaluate(source, scope);
  const [, left, operator, right] = comparison;
  const a = evaluate(left, scope);
  const b = evaluate(right, scope);
  switch (operator) {
    case "==": return a === b;
    case "!=": return a !== b;
    case ">=": return Number(a) >= Number(b);
    case "<=": return Number(a) <= Number(b);
    case ">": return Number(a) > Number(b);
    default: return Number(a) < Number(b);
  }
}

/** Liquid's idea of true, which is everything that is not nil and not false. */
function truthy(value) {
  return value !== undefined && value !== null && value !== false;
}

/** A value and its filters: `"/assets/" | append: shot.file | relative_url`. */
function evaluate(source, scope) {
  const [head, ...filters] = split(source.trim(), "|");
  let value = lookup(head.trim(), scope);
  for (const filter of filters) {
    const [, name, rest] = filter.trim().match(/^(\w+)\s*:?\s*([\s\S]*)$/);
    if (!SUPPORTED.filters.includes(name)) throw new Error(`preview: unsupported Liquid filter | ${name}`);
    const parameters = rest ? split(rest, ",").map((p) => lookup(p.trim(), scope)) : [];
    value = apply(name, value, parameters);
  }
  return value;
}

/** The filters, and only the ones the templates ask for. */
function apply(name, value, [first, second]) {
  switch (name) {
    case "default": return truthy(value) ? value : first;
    case "size": return value?.length ?? 0;
    case "split": return String(value).split(first);
    case "minus": return Number(value) - Number(first);
    case "plus": return Number(value) + Number(first);
    case "append": return `${value}${first}`;
    case "replace": return String(value).split(first).join(second);
    // The site is served from a subdirectory, so Jekyll would put the project
    // name in front. Here the pictures are files, and the browser is opened on
    // one — so the front of the path is the directory they are actually in.
    case "relative_url": return path.join(SITE, String(value));
    default: throw new Error(`preview: unsupported Liquid filter | ${name}`);
  }
}

/** A literal, or a path like `site.data.install[page.lang]` or `shot.mark.x`. */
function lookup(source, scope) {
  if (/^-?\d+(\.\d+)?$/.test(source)) return Number(source);
  if (source === "true") return true;
  if (source === "false") return false;
  if (/^"[^"]*"$/.test(source) || /^'[^']*'$/.test(source)) return source.slice(1, -1);

  let value = scope;
  const steps = source.match(/^\w+|\.\w+|\[[^\]]+\]/g) || [];
  for (const step of steps) {
    if (value === undefined || value === null) return undefined;
    const key = step.startsWith("[")
      ? lookup(step.slice(1, -1).trim(), scope)
      : step.replace(/^\./, "");
    value = value[key];
  }
  return value;
}

/** Split on a separator that is not inside quotes — filters and their arguments. */
function split(source, separator) {
  const parts = [];
  let quote = null;
  let current = "";
  for (const character of source) {
    if (quote) {
      if (character === quote) quote = null;
      current += character;
    } else if (character === '"' || character === "'") {
      quote = character;
      current += character;
    } else if (character === separator) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

/** What `{{ }}` prints: nothing for a missing value, the way Liquid does. */
function show(value) {
  return value === undefined || value === null || value === false ? "" : String(value);
}

// --- YAML ------------------------------------------------------------------

/**
 * The corner of YAML that `docs/_data` is written in: maps, lists of maps,
 * scalars, and the folded `>-` that keeps a long sentence off one long line.
 * Anything else throws rather than being read as something it is not.
 */
function parseYaml(text) {
  const lines = [];
  for (const raw of text.split("\n")) {
    if (/^\s*(#|$)/.test(raw)) continue;
    lines.push({ indent: raw.match(/^ */)[0].length, text: raw.trim(), raw });
  }
  let at = 0;

  function scalar(source) {
    if (/^-?\d+(\.\d+)?$/.test(source)) return Number(source);
    if (source === "true") return true;
    if (source === "false") return false;
    return source;
  }

  /** A `>-` body: every deeper line, joined with the space YAML would join it with. */
  function folded(indent) {
    const parts = [];
    while (at < lines.length && lines[at].indent > indent) parts.push(lines[at++].text);
    return parts.join(" ");
  }

  function block(indent) {
    if (lines[at].text.startsWith("- ")) {
      const items = [];
      while (at < lines.length && lines[at].indent === indent && lines[at].text.startsWith("- ")) {
        // A dash and its first key share a line. Cutting the dash off turns the
        // item into an ordinary map that starts where its later keys already do.
        lines[at].text = lines[at].text.slice(2);
        lines[at].indent += 2;
        items.push(block(indent + 2));
      }
      return items;
    }
    const map = {};
    while (at < lines.length && lines[at].indent === indent) {
      const line = lines[at++];
      const entry = line.text.match(/^([^:]+):\s*([\s\S]*)$/);
      if (!entry) throw new Error(`preview: cannot read the YAML line ${JSON.stringify(line.raw)}`);
      const [, key, rest] = entry;
      if (rest === ">-" || rest === ">") map[key] = folded(indent);
      else if (rest !== "") map[key] = scalar(rest);
      else map[key] = at < lines.length && lines[at].indent > indent ? block(lines[at].indent) : null;
    }
    return map;
  }

  return block(lines[0].indent);
}
