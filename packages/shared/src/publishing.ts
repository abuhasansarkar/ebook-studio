export const MARKETPLACES = ['kdp_ebook', 'etsy', 'gumroad', 'direct'] as const;
export type Marketplace = typeof MARKETPLACES[number];
export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  kdp_ebook: 'Amazon KDP eBook', etsy: 'Etsy digital download', gumroad: 'Gumroad', direct: 'Own website / other stores',
};
export interface PublishingCheck { id: string; status: 'pass' | 'blocker' | 'review'; message: string; source?: string }
export interface PublishingReport {
  destination: Marketplace;
  rulesVersion: string;
  checkedAt: string;
  bookId: string;
  chapterVersions: { id: string; version: number }[];
  checks: PublishingCheck[];
  status: 'blocked' | 'review_required';
}
export const PUBLISHING_SOURCES = {
  kdpLanguages: 'https://kdp.amazon.com/en_US/help/topic/G200673300',
  kdpIndian: 'https://kdp.amazon.com/en_US/help/topic/G202124400',
  kdpFormats: 'https://kdp.amazon.com/help?topicId=G200634390',
  kdpContent: 'https://kdp.amazon.com/en_US/help/topic/G200644110',
  kdpSelect: 'https://kdp.amazon.com/en_US/select',
  etsyFiles: 'https://help.etsy.com/hc/en-us/articles/115015628347-How-to-Manage-Your-Digital-Listings',
  etsyCreativity: 'https://www.etsy.com/legal/creativity/',
  etsyAI: 'https://www.etsy.com/seller-handbook/article/1522733284810',
  gumroad: 'https://gumroad.com/help/article/357-sell-an-ebook',
} as const;

/** Deliberately never declares marketplace approval: rights, accuracy and reader
 * experience require human review. Rules apply only to the named destination. */
export function publishingChecks(input: {
  destination: Marketplace; language: string; title: string; authorName?: string;
  chapters: { wordCount: number; status: string }[];
  files: { format: string; fileSize: number | null }[];
}): PublishingCheck[] {
  const { destination, chapters, files } = input;
  const checks: PublishingCheck[] = [];
  const check = (id: string, ok: boolean, message: string, source?: string) => checks.push({ id, status: ok ? 'pass' : 'blocker', message, source });
  const review = (id: string, message: string, source?: string) => checks.push({ id, status: 'review', message, source });
  check('title', !!input.title.trim() && input.title !== 'Untitled book', 'Set the final book title.');
  check('author', !!input.authorName?.trim(), 'Set the author or pen name in the book brief.');
  check('chapters', chapters.length > 0 && chapters.every(c => c.wordCount > 0 && c.status === 'done'), 'Complete every chapter before preparing the sale edition.');
  review('proofreading', 'Proofread the entire book, verify claims and citations, and review the downloaded file on target devices.');
  review('rights', 'Confirm commercial rights to the text, images and fonts, including any generated or imported material.');
  review('listing', 'Prepare a truthful description, cover, preview, categories, price and customer support details.');
  review('exclusivity', 'If this eBook is enrolled in KDP Select, resolve its digital exclusivity before distributing it through other stores.', PUBLISHING_SOURCES.kdpSelect);
  if (destination === 'kdp_ebook') {
    // Intersection of app languages with KDP's supported eBook languages, checked 2026-11-20.
    check('language', ['en', 'hi', 'es', 'ar', 'fr', 'pt', 'de', 'ja', 'it', 'ta', 'fa'].includes(input.language), 'The manuscript language must be supported for Kindle eBooks. App language support does not imply KDP eligibility.', PUBLISHING_SOURCES.kdpLanguages);
    const indian = ['hi', 'ta'].includes(input.language);
    check('format', files.some(f => f.format === (indian ? 'docx' : 'epub')), indian ? 'Prepare a DOCX manuscript for this Indian language under KDP’s current guidance.' : 'Prepare and validate a reflowable EPUB for this workflow; a PDF export alone does not satisfy this check.', indian ? PUBLISHING_SOURCES.kdpIndian : PUBLISHING_SOURCES.kdpFormats);
    review('ai_disclosure', 'Disclose AI-generated text, images and translations accurately during KDP submission, including generated material edited afterward.', PUBLISHING_SOURCES.kdpContent);
    review('kindle_preview', 'Inspect the final manuscript in Kindle Previewer, including navigation, tables, reading direction and cover.');
  } else {
    const usable = files.filter(f => ['pdf', 'epub'].includes(f.format));
    check('format', usable.length > 0, 'Generate a downloadable PDF or EPUB for customers.', destination === 'gumroad' ? PUBLISHING_SOURCES.gumroad : undefined);
    if (destination === 'etsy') {
      // Evaluate each candidate separately; history is not the set of listing attachments.
      check('file_size', usable.some(f => f.fileSize !== null && f.fileSize > 0 && f.fileSize <= 20000000), 'Choose a delivery file no larger than 20 MB. Larger files need a separately prepared compliant delivery package.', PUBLISHING_SOURCES.etsyFiles);
      review('file_count', 'Select at most five listing attachments, each within Etsy’s size limit. Export history is not a listing bundle.', PUBLISHING_SOURCES.etsyFiles);
      review('originality', 'Confirm you created or designed the product and disclose AI use in the listing description. Review current listing-image rules.', PUBLISHING_SOURCES.etsyCreativity);
      review('listing_images', 'Listing previews must accurately represent the digital product buyers receive.', PUBLISHING_SOURCES.etsyAI);
    }
  }
  review('freshness', 'Export history is not yet tied to immutable manuscript snapshots. Rebuild and inspect the delivery file after the final edit.');
  return checks;
}
