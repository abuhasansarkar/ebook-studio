"use client";

import React, { useState } from 'react';
import {
  Download,
  FileImage,
  FileText,
  CheckCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  bookId: string;
  savedVersion: number;
}

type ExportFormat = 'jpeg' | 'png' | 'pdf';

export function ExportModal({
  open,
  onClose,
  bookId,
  savedVersion,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!savedVersion) {
      toast.error('Please save your cover before downloading.');
      return;
    }

    setDownloading(true);
    try {
      const response = await fetch(
        `/api/v1/books/${bookId}/cover/render?version=${savedVersion}&format=${format}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          body?.error?.message ?? `Cover export failed (${response.status}). Please try again.`
        );
      }

      const blob = await response.blob();
      const ext = format === 'pdf' ? 'pdf' : format === 'png' ? 'png' : 'jpg';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cover-v${savedVersion}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`Downloaded cover version ${savedVersion} as ${ext.toUpperCase()}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export Cover Artwork"
      description="Download high-resolution cover files ready for digital publishing and print."
      className="max-w-md"
    >
      <div className="space-y-4 pt-1">
        {/* Format Selection Cards */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* JPG */}
          <button
            type="button"
            onClick={() => setFormat('jpeg')}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
              format === 'jpeg'
                ? 'border-primary bg-primary-soft/40 shadow-xs'
                : 'border-border bg-surface hover:bg-muted/40'
            }`}
          >
            <FileImage className={`h-6 w-6 mb-1.5 ${format === 'jpeg' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="font-bold text-xs text-foreground">JPG</span>
            <span className="text-[10px] text-muted-foreground">Digital eBook</span>
          </button>

          {/* PNG */}
          <button
            type="button"
            onClick={() => setFormat('png')}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
              format === 'png'
                ? 'border-primary bg-primary-soft/40 shadow-xs'
                : 'border-border bg-surface hover:bg-muted/40'
            }`}
          >
            <FileImage className={`h-6 w-6 mb-1.5 ${format === 'png' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="font-bold text-xs text-foreground">PNG</span>
            <span className="text-[10px] text-muted-foreground">Lossless High-DPI</span>
          </button>

          {/* PDF */}
          <button
            type="button"
            onClick={() => setFormat('pdf')}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
              format === 'pdf'
                ? 'border-primary bg-primary-soft/40 shadow-xs'
                : 'border-border bg-surface hover:bg-muted/40'
            }`}
          >
            <FileText className={`h-6 w-6 mb-1.5 ${format === 'pdf' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="font-bold text-xs text-foreground">PDF</span>
            <span className="text-[10px] text-muted-foreground">Print-Ready</span>
          </button>
        </div>

        {/* Specifications Box */}
        <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Dimensions:</span>
            <span className="font-mono font-bold text-foreground">1600 × 2560 px</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Aspect Ratio:</span>
            <span className="font-mono text-foreground">1:1.6 (Kindle Standard)</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Print Resolution:</span>
            <span className="font-mono text-foreground">300 DPI</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Cover Version:</span>
            <span className="font-mono text-foreground">v{savedVersion}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={downloading}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={downloading || !savedVersion}
            className="gap-1.5 font-semibold shadow-xs"
          >
            {downloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Exporting…</span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                <span>Download {format.toUpperCase()}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
