// Debug script to inspect diagnostics for escaped annotation case
const Module = require('module');
const originalRequire = Module.prototype.require;
const vscode = {
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Position: function (line, character) { return { line, character }; },
  Range: function (startLine, startChar, endLine, endChar) {
    return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
  },
};
Module.prototype.require = function (id) {
  if (id === 'vscode') return vscode;
  return originalRequire.apply(this, arguments);
};
const diagnostics = require('../out/diagnostics');
Module.prototype.require = originalRequire;

const text = `typedef string Email
struct User {
  3: optional Email email (go.tag="xx:\"len($)>0\""),
}`;

const issues = diagnostics.analyzeThriftText(text);
console.log('Issues:', issues.map(i => ({ code: i.code, message: i.message, range: i.range })));

// Inspect bracket scanning on the annotation line
const line = '  3: optional Email email (go.tag="xx:\\"len($)>0\\""),';
let inS = false, inD = false, escaped = false;
const events = [];
for (let i = 0; i < line.length; i++) {
  const ch = line[i];
  if (inS) {
    if (!escaped && ch === '\\') { escaped = true; continue; }
    if (!escaped && ch === '\'') { inS = false; }
    escaped = false; continue;
  }
  if (inD) {
    if (!escaped && ch === '\\') { escaped = true; continue; }
    if (!escaped && ch === '"') { inD = false; }
    escaped = false; continue;
  }
  if (ch === '\'') { inS = true; continue; }
  if (ch === '"') { inD = true; continue; }
  if (ch === '{' || ch === '(' || ch === '<') { events.push({i, ch, kind: 'open'}); }
  if (ch === '}' || ch === ')' || ch === '>') { events.push({i, ch, kind: 'close'}); }
}
console.log('Bracket events (outside strings):', events);

// Whole-text bracket scan like diagnostics does
const lines = text.split('\n');
const globalEvents = [];
for (let ln = 0; ln < lines.length; ln++) {
  const lineText = lines[ln];
  let inS2 = false, inD2 = false, esc2 = false;
  for (let i = 0; i < lineText.length; i++) {
    const c = lineText[i];
    if (inS2) {
      if (!esc2 && c === '\\') { esc2 = true; continue; }
      if (!esc2 && c === '\'') { inS2 = false; }
      esc2 = false; continue;
    }
    if (inD2) {
      if (!esc2 && c === '\\') { esc2 = true; continue; }
      if (!esc2 && c === '"') { inD2 = false; }
      esc2 = false; continue;
    }
    if (c === '\'') { inS2 = true; continue; }
    if (c === '"') { inD2 = true; continue; }
    if (c === '{' || c === '(' || c === '<') { globalEvents.push({ln, i, ch: c, kind: 'open'}); }
    if (c === '}' || c === ')' || c === '>') { globalEvents.push({ln, i, ch: c, kind: 'close'}); }
  }
}
console.log('Global bracket events:', globalEvents);

// Trace string state transitions on the struct line
const traceLine = lines[2];
let sInS = false, sInD = false, sEsc = false;
const trace = [];
for (let i = 0; i < traceLine.length; i++) {
  const c = traceLine[i];
  if (sInS) {
    if (!sEsc && c === '\\') { sEsc = true; trace.push({i, c, evt:'esc'}); continue; }
    if (!sEsc && c === '\'') { sInS = false; trace.push({i, c, evt:'exitS'}); }
    sEsc = false; continue;
  }
  if (sInD) {
    if (!sEsc && c === '\\') { sEsc = true; trace.push({i, c, evt:'esc'}); continue; }
    if (!sEsc && c === '"') { sInD = false; trace.push({i, c, evt:'exitD'}); }
    sEsc = false; continue;
  }
  if (c === '\'') { sInS = true; trace.push({i, c, evt:'enterS'}); continue; }
  if (c === '"') { sInD = true; trace.push({i, c, evt:'enterD'}); continue; }
}
console.log('String state trace:', trace);
console.log('Trace line literal:', JSON.stringify(traceLine));
const sample = traceLine.slice(30, 52);
const codes = [];
for (let i = 0; i < sample.length; i++) {
  codes.push({i: 30+i, ch: sample[i], code: sample.charCodeAt(i)});
}
console.log('Sample chars 30-52:', codes);