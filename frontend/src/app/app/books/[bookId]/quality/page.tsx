"use client";
import { use } from 'react';
import { QualityWorkspace } from '@/components/quality/quality-workspace';
export default function QualityPage({ params }: { params: Promise<{ bookId: string }> }) { return <QualityWorkspace bookId={use(params).bookId} />; }
