"use client";
import { use } from 'react';
import { DesignStudio } from '@/components/design/design-studio';
export default function DesignPage({ params }: { params: Promise<{ bookId: string }> }) { return <DesignStudio bookId={use(params).bookId} />; }
