import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';

// @nestjs-modules/mailer's HandlebarsAdapter only renders the HTML body from
// the .hbs file; the plain-text sibling (recommended for deliverability) has
// to be rendered separately. Compiled templates are cached since the source
// files never change at runtime.
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const compiledCache = new Map<string, HandlebarsTemplateDelegate>();

export function renderPlainTextTemplate(
  name: string,
  context: Record<string, unknown>,
): string {
  let compiled = compiledCache.get(name);

  if (!compiled) {
    const source = fs.readFileSync(
      path.join(TEMPLATES_DIR, `${name}.txt`),
      'utf8',
    );

    compiled = Handlebars.compile(source);
    compiledCache.set(name, compiled);
  }

  return compiled(context);
}
