import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import ts from 'typescript'

const compact = value => value.replace(/\s+/g, ' ').trim()
const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name)
  return entry.isDirectory() ? files(file) : /\.tsx?$/.test(file) ? [file] : []
})

export function createCensus() {
  const controls = []
  const fingerprint = crypto.createHash('sha256')
  const sources = files('src').sort()
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8')
    fingerprint.update(file).update(text)
    if (!file.endsWith('.tsx')) continue
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source)
        const attributes = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute)
          .map(attribute => [attribute.name.getText(source), attribute.initializer ? compact(attribute.initializer.getText(source)) : 'true']))
        const handlers = Object.keys(attributes).filter(key => /^on(Click|Change|Select|Submit|Pointer|Touch|Key|Drag|Drop|DoubleClick)/.test(key))
        const nativeControl = /^(button|input|select|textarea|summary|a|audio|video)$/.test(tag)
        const customControl = /(^|\.)(button|a|input)$/.test(tag) || /^(Pressable|IOSSwitch|PremiumPicker|PremiumDisclosure)$/.test(tag)
        if (nativeControl || customControl || handlers.length || /button|switch|slider|tab|menuitem|option|checkbox|radio/.test(attributes.role ?? '')) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
          const label = attributes['aria-label'] ?? attributes.title ?? attributes.placeholder ??
            (ts.isJsxElement(node.parent) ? node.parent.children.filter(ts.isJsxText).map(n => compact(n.text)).filter(Boolean).join(' ') : '')
          const conditions = []
          for (let ancestor = node.parent; ancestor && conditions.length < 4; ancestor = ancestor.parent) {
            if (ts.isConditionalExpression(ancestor)) conditions.push(compact(ancestor.condition.getText(source)).slice(0, 240))
            if (ts.isBinaryExpression(ancestor) && ancestor.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
              conditions.push(compact(ancestor.left.getText(source)).slice(0, 240))
          }
          controls.push({ id: `${file}:${line}`, source: file, line, tag, label: label || '(dynamic/nested label; inspect rendered UI)',
            handlers: Object.fromEntries(handlers.map(key => [key, attributes[key].slice(0, 300)])),
            states: { disabled: attributes.disabled ?? null, expanded: attributes['aria-expanded'] ?? null,
              pressed: attributes['aria-pressed'] ?? null, checked: attributes.checked ?? attributes['aria-checked'] ?? null,
              conditions }, status: 'untested', expected: 'Requires semantic review and live outcome assertion; see curated workflow inventory.' })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return { generatedAt: new Date().toISOString(), sourceSha256: fingerprint.digest('hex'), sourceFiles: sources.length,
    limitation: 'Static candidate census, not proof of runtime reachability, all dynamic options, gestures, or complete state coverage. Utility test passes never mark controls passed.', controls }
}
