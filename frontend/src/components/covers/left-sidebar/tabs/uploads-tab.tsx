"use client";

import React, { useRef, useState } from 'react';
import { UploadCloud, FolderOpen, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UploadsTabProps {
  onOpenAssetLibrary: () => void;
  onAddImageLayer: (url: string, name?: string) => void;
  onSetBackgroundArtwork: (url: string) => void;
}

export function UploadsTab({
  onOpenAssetLibrary,
  onAddImageLayer,
  onSetBackgroundArtwork,
}: UploadsTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    // Read local file as object URL / data URL for immediate client preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      if (url) {
        onAddImageLayer(url, file.name);
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => setUploading(false);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="font-bold text-sm text-foreground">Uploads & Assets</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Upload custom photos, artwork, and brand graphics.
        </p>
      </div>

      {/* File Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-border hover:border-primary bg-muted/20 hover:bg-primary-soft/20 transition-all cursor-pointer text-center space-y-2 group"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleFileChange}
          className="sr-only"
        />

        <div className="p-3 rounded-full bg-surface shadow-xs group-hover:scale-110 transition-transform">
          {uploading ? (
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          ) : (
            <UploadCloud className="h-6 w-6 text-primary" />
          )}
        </div>

        <div>
          <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors block">
            Click to upload image
          </span>
          <span className="text-[10px] text-muted-foreground">PNG, JPG, WebP, or SVG</span>
        </div>
      </div>

      {/* Asset Library Trigger */}
      <div className="space-y-2 pt-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Project Library
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenAssetLibrary}
          className="w-full justify-center gap-2 text-xs h-9"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span>Browse Asset Library</span>
        </Button>
      </div>
    </div>
  );
}
