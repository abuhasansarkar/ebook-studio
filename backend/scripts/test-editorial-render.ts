import { config } from 'dotenv';
config({ path: '../.env' });
import { applyTemplate, defaultBookDesign, findTemplate } from '@ebook/shared';
import { markdownToTiptap } from '../src/services/editor/markdownToTiptap.js';
import { renderBookHtml } from '../src/services/exports/bookHtml.js';
import type { BookDocument } from '../src/services/design/bookDocument.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('Testing Editorial Template & Component Rendering...');

  const editorialTemplate = findTemplate('editorial');
  const standardTemplate = findTemplate('standard');
  if (!editorialTemplate) throw new Error('Editorial template not found in TEMPLATES!');
  if (!standardTemplate) throw new Error('Standard template not found in TEMPLATES!');

  console.log(`✓ Found previous template: "${standardTemplate.name}" (id: ${standardTemplate.id})`);
  console.log(`✓ Found current template: "${editorialTemplate.name}" (id: ${editorialTemplate.id})`);

  const baseDesign = defaultBookDesign('fr', 'Claire - Melle Digital');
  const editorialDesign = applyTemplate(baseDesign, editorialTemplate);
  const standardDesign = applyTemplate(baseDesign, standardTemplate);

  console.log(`✓ Standard accent: ${standardDesign.elements.accent}, Trim: ${standardDesign.print.trim}`);
  console.log(`✓ Editorial accent: ${editorialDesign.elements.accent}, Trim: ${editorialDesign.print.trim}`);

  const sampleMarkdownCh1 = `
> [!QUOTE]
> L'UGC m'a permis de sortir de la galère et de construire une vie qui me ressemble.

Je m'appelle Claire, je suis maman solo, et pendant longtemps j'ai cru que pour collaborer avec des marques, il fallait des milliers d'abonnés.

👉 Je peux être là pour mes enfants.
👉 Je n'ai plus de patron sur le dos.
👉 Je travaille avec des marques depuis chez moi, juste avec mon téléphone.
`;

  const sampleMarkdownCh2 = `
01 Qu'est-ce que l'UGC ?
UGC = User Generated Content → en français, "contenu créé par les utilisateurs".

👉 Traduction simple : tu prends ton téléphone, tu fais une vidéo ou une photo avec un produit, et la marque te paie pour l'utiliser.

> [!EXAMPLE] Exemple concret
> Imagine que tu filmes ton café du matin ☕. Tu poses ton téléphone, tu verses le café dans ta tasse, tu montres ton petit moment détente. Et bien si tu avais un partenariat avec une marque de café, cette petite vidéo toute simple pourrait être un contenu UGC payé 💸.
`;

  const sampleMarkdownCh3 = `
> [!MISTAKE] Attendre d'avoir plus d'abonnés
> Comme je venais de l'influence, j'avais ce réflexe de regarder mes followers... En UGC, les marques s'en fichent de ton audience.

> [!MISTAKE] Croire qu'il faut du matériel pro
> Ton téléphone et une bonne lumière suffisent largement. Pas besoin de studio ni de micro sophistiqué.

> [!MISTAKE] Accepter toutes les collaborations gratuites
> Oui, tu peux accepter 1 ou 2 collabs gratuites pour te faire la main, mais pas plus. Ton travail a de la valeur.

> [!SUMMARY]
> - Utilise ce que tu as déjà.
> - Crée 3-4 vidéos tests.
> - Ose contacter une marque.
`;

  const docEditorial: BookDocument = {
    book: {
      id: 'test-book-id',
      title: "COMMENT GAGNER DE L'ARGENT AVEC LES MARQUES SANS ABONNÉS",
      subtitle: 'juste avec ton téléphone',
      author: 'Claire - Melle Digital',
      language: 'fr',
      dir: 'ltr',
    },
    design: { version: 1, data: editorialDesign },
    chapters: [
      { id: 'ch-1', position: 1, version: 1, title: 'Introduction', content: markdownToTiptap(sampleMarkdownCh1) },
      { id: 'ch-2', position: 2, version: 1, title: "Qu'est-ce que l'UGC ?", content: markdownToTiptap(sampleMarkdownCh2) },
      { id: 'ch-3', position: 3, version: 1, title: 'Les erreurs à éviter quand on débute', content: markdownToTiptap(sampleMarkdownCh3) },
    ],
    partial: false,
  };

  const docStandard: BookDocument = {
    ...docEditorial,
    design: { version: 1, data: standardDesign },
  };

  const editorialHtml = renderBookHtml(docEditorial, {
    mode: 'print',
    fontSrc: (f) => `https://fonts.ebook.invalid/${f}`,
    images: {},
    available: new Set(['notoserif', 'notosans']),
  });

  const standardHtml = renderBookHtml(docStandard, {
    mode: 'print',
    fontSrc: (f) => `https://fonts.ebook.invalid/${f}`,
    images: {},
    available: new Set(['notoserif', 'notosans']),
  });

  // Validations
  const checks = [
    { label: '[Editorial] Background is warm cream #faf6f2', pass: editorialHtml.includes('background:#faf6f2') },
    { label: '[Editorial] Oversized chapter label 01 present', pass: editorialHtml.includes('<p class="chapter-label">01</p>') },
    { label: '[Editorial] Concrete example card rendered', pass: editorialHtml.includes('class="card-example"') },
    { label: '[Editorial] Mistake cards rendered', pass: editorialHtml.includes('class="card-mistake"') },
    { label: '[Editorial] Summary banner rendered', pass: editorialHtml.includes('class="summary-banner"') },
    { label: '[Standard] Background is pure white #fff', pass: standardHtml.includes('background:#fff') },
    { label: '[Standard] Chapter label is standard 1 (not 01)', pass: standardHtml.includes('<p class="chapter-label">1</p>') },
    { label: '[Standard] Standard ornament 2.5em applied', pass: standardHtml.includes('width:2.5em') },
  ];

  console.log('\n--- VERIFICATION CHECKS ---');
  let allPass = true;
  for (const c of checks) {
    console.log(`${c.pass ? '✓' : '✗'} ${c.label}`);
    if (!c.pass) allPass = false;
  }

  if (!allPass) {
    throw new Error('Some verification checks failed!');
  }

  const outPathEditorial = path.resolve('backend/dist/sample-editorial-preview.html');
  const outPathStandard = path.resolve('backend/dist/sample-standard-preview.html');
  await fs.mkdir(path.dirname(outPathEditorial), { recursive: true });
  await fs.writeFile(outPathEditorial, editorialHtml, 'utf-8');
  await fs.writeFile(outPathStandard, standardHtml, 'utf-8');
  console.log(`\n✓ Editorial preview saved to: ${outPathEditorial} (${editorialHtml.length} bytes)`);
  console.log(`✓ Standard preview saved to: ${outPathStandard} (${standardHtml.length} bytes)`);

  console.log('Testing Chromium PDF Rendering for Editorial eBook...');
  const { renderPdf, closeBrowser } = await import('../src/services/exports/pdfRenderer.js');
  try {
    const rendered = await renderPdf(editorialHtml);
    console.log(`✓ PDF successfully rendered! Pages: ${rendered.pageCount}, Size: ${rendered.buffer.length} bytes`);
    const pdfPath = path.resolve('backend/dist/sample-editorial-book.pdf');
    await fs.writeFile(pdfPath, rendered.buffer);
    console.log(`✓ Sample PDF saved to: ${pdfPath}`);
  } finally {
    await closeBrowser();
  }

  console.log('Both Standard (previous) and Editorial (current) validations succeeded!');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
