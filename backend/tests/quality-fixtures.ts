import { markdownToTiptap } from '../src/services/editor/markdownToTiptap.js';
import type { ChapterInput, CheckInput } from '../src/services/quality/checks.js';

/** Curated S09 fixtures: every injected defect is listed with the rule, chapter and exact text expected. */
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: text ? [{ type: 'text', text }] : [] });
const link = (before: string, label: string, href: string) => ({ type: 'paragraph', content: [{ type: 'text', text: before }, { type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] }, { type: 'text', text: '.' }] });
const img = (assetId: string, alt: string, caption = '') => ({ type: 'image', attrs: { assetId, alt, caption } });
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const chapter = (i: number, title: string, content: unknown, wordCount = 400, targetWords = 500): ChapterInput => ({ id: `ch${i}`, version: 3, position: i, title, content, wordCount, targetWords });

const REPEATED = 'Batch cooking on a quiet Sunday afternoon gives busy parents a calmer week and fewer last-minute takeaway orders.';
const SENTENCE = 'A labelled freezer drawer saves more time than any clever recipe ever will.';
const THAI = 'การเตรียมอาหารล่วงหน้าช่วยให้ครอบครัวมีเวลามากขึ้นในแต่ละสัปดาห์และลดความเครียดในการทำอาหารทุกวัน'.repeat(4);

export const READY = 'asset_ready_1';
export const flawedInput = (): CheckInput => ({
  title: 'Meal Prep for Busy Parents', subtitle: '', author: '', language: 'en', referencesEnabled: false,
  readyAssets: new Set([READY]), uncoveredCharacters: new Set([...THAI]),
  context: { voice: 'Warm and practical.', terms: [{ preferred: 'use', avoid: ['utilise'], note: 'Plain English' }] },
  chapters: [
    chapter(0, 'Getting started', doc(
      h(3, 'Details first'),
      p('TODO: add a worked example for the shopping list.'),
      p('Keep the **important** containers at eye level so they are used first.'),
      p('Studies show that 73% of parents skip breakfast on weekdays.'),
      link('For storage tips, ', 'see the section below', '#storage'),
      p('Most families utilise the freezer far less than they could.'),
      p(REPEATED),
      p(`Organisation matters more than equipment. ${SENTENCE}`),
    )),
    chapter(1, 'Planning', doc(
      p(REPEATED),
      img(READY, ''),
      img('asset_missing_9', 'A shopping basket', 'Weekly basket'),
      h(2, 'Empty section'),
      h(2, 'Shopping'),
      link('Download the planner from ', 'our printable page', 'http://example.com/planner'),
      p(`Start small and build habits. ${SENTENCE}`),
    )),
    chapter(2, 'Planning', doc(p(THAI))),
    chapter(3, 'Leftovers', doc(), 0),
    chapter(4, 'Snacks', doc(p('Fruit, nuts and yoghurt are easy snacks to prepare ahead of time for the week.')), 50, 1500),
  ],
});
/** Expected findings: [ruleId, chapterId or null, exact quote or null]. */
export const EXPECTED: [string, string | null, string | null][] = [
  ['metadata.author-missing', null, null],
  ['structure.heading-skip', 'ch0', 'Details first'],
  ['content.placeholder', 'ch0', 'TODO'],
  ['content.markdown', 'ch0', '**important**'],
  ['evidence.claim', 'ch0', 'Studies show that 73% of parents skip breakfast on weekdays.'],
  ['links.internal', 'ch0', 'see the section below'],
  ['consistency.term', 'ch0', 'utilise'],
  ['repetition.paragraph', 'ch1', REPEATED],
  ['repetition.sentence', 'ch1', SENTENCE],
  ['accessibility.alt', 'ch1', null],
  ['assets.unavailable', 'ch1', null],
  ['structure.heading-without-content', 'ch1', 'Empty section'],
  ['links.insecure', 'ch1', 'our printable page'],
  ['content.duplicate-title', 'ch2', null],
  ['language.script', 'ch2', null],
  ['typesetting.glyph', 'ch2', THAI[0]],
  ['content.empty-chapter', 'ch3', null],
  ['content.short-chapter', 'ch4', null],
];

export const cleanInput = (): CheckInput => ({
  title: 'Meal Prep for Busy Parents', subtitle: 'A calm week', author: 'Rina Das', language: 'en', referencesEnabled: true,
  readyAssets: new Set([READY]), uncoveredCharacters: new Set(),
  context: { voice: 'Warm and practical.', terms: [{ preferred: 'use', avoid: ['utilise'], note: '' }] },
  chapters: [
    chapter(0, 'Getting started', markdownToTiptap(`## Why plan ahead\n\nA little time on Sunday makes the whole week easier. Families who plan meals tend to waste less food and argue less about dinner.\n\n### A simple routine\n\nPick three recipes, shop once and cook in two batches. Label every container with the date.\n\n- Choose recipes\n- Write the list\n- Cook and label\n\nRead the [storage guide](https://example.com/storage) for safe freezer times.`)),
    chapter(1, 'Planning the week', doc(h(2, 'Building the plan'), p('Use a whiteboard on the fridge so everyone can see what is coming.'), img(READY, 'A whiteboard with the weekly menu', 'Weekly menu'), p('Rotate favourite meals so nobody feels stuck with the same dish.'))),
  ],
});
export const bengaliCleanInput = (): CheckInput => ({
  title: 'সহজ রান্না', subtitle: '', author: 'রিনা দাস', language: 'bn', referencesEnabled: false, readyAssets: new Set(), uncoveredCharacters: new Set(),
  context: { voice: '', terms: [] },
  chapters: [chapter(0, 'প্রথম অধ্যায়', markdownToTiptap('## কেন আগে থেকে রান্না করবেন\n\nরবিবারে একটু সময় দিলে পুরো সপ্তাহ সহজ হয়ে যায়। ক্ষুধার্ত শিশুদের জন্য দ্রুত খাবার তৈরি রাখা যায় এবং সন্ধ্যায় চাপ কমে।\n\n### শুরু করার উপায়\n\nতিনটি রান্না বেছে নিন, একবার বাজার করুন এবং দুই দফায় রান্না করুন। প্রতিটি পাত্রে তারিখ লিখে রাখুন।'))],
});
