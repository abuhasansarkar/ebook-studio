import { describe, it } from 'vitest';
import { prisma } from '../src/database/prisma.js';
import { bookService } from '../src/services/books/bookService.js';
import { exportService } from '../src/services/exports/exportService.js';
import { bookBriefSchema } from '@ebook/shared';
import { markdownToTiptap } from '../src/services/editor/markdownToTiptap.js';
import { brief, createUser } from './helpers.js';

describe('diag', () => {
  it('shows the epub export error', async () => {
    const user = await createUser('diag');
    const book = await bookService.create(user.user.id, bookBriefSchema.parse(brief({ authorName: 'X' }).brief));
    await prisma.chapter.create({ data: { bookId: book.id, position: 0, title: 'C1', status: 'done', wordCount: 20, contentJson: markdownToTiptap('Hello world.') as object } });
    const exp = await exportService.request(user.user.id, book.id, 'epub');
    await exportService.process(exp.id);
    const done = await prisma.export.findUniqueOrThrow({ where: { id: exp.id } });
    console.log('STATUS=', done.status);
    console.log('ERROR=', done.error);
    console.log('VALIDATION=', JSON.stringify(done.validation, null, 2));
    await prisma.$disconnect();
  });
});
