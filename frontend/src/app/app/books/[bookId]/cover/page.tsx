"use client";
import { use } from 'react';
import { CoverStudio } from '@/components/covers/cover-studio';
export default function CoverPage({ params }: { params: Promise<{ bookId: string }> }) { return <CoverStudio bookId={use(params).bookId} />; }
