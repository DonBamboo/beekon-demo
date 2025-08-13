import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Upload, X, AlertCircle, CheckCircle, Camera, Image } from 'lucide-react';

interface FileDropZoneProps {
  onFileSelect: (file: File) => void;
  acceptedTypes?: string[];
  maxSize?: number; // in bytes
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  showPreview?: boolean;
  uploadProgress?: number;
  isUploading?: boolean;
  error?: string | null;
  success?: boolean;
  placeholder?: string;
  variant?: 'default' | 'avatar' | 'compact';
}

export function FileDropZone({
  onFileSelect,
  acceptedTypes = ['image/*'],
  maxSize = 2 * 1024 * 1024, // 2MB default
  multiple = false,
  disabled = false,
  className,
  showPreview = true,
  uploadProgress = 0,
  isUploading = false,
  error = null,
  success = false,
  placeholder,
  variant = 'default',
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    if (maxSize && file.size > maxSize) {
      return `File size (${formatFileSize(file.size)}) exceeds maximum limit of ${formatFileSize(maxSize)}`;
    }

    if (acceptedTypes.length > 0) {
      const isValidType = acceptedTypes.some(type => {
        if (type === 'image/*') {
          return file.type.startsWith('image/');
        }
        return file.type === type;
      });

      if (!isValidType) {
        return `File type ${file.type} is not supported. Supported types: ${acceptedTypes.join(', ')}`;
      }
    }

    return null;
  }, [formatFileSize, maxSize, acceptedTypes]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const validationError = validateFile(file);
    
    if (validationError) {
      // File validation error
      return;
    }

    setSelectedFile(file);
    onFileSelect(file);

    // Create preview for images
    if (showPreview && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          setPreview(result);
        }
      };
      reader.readAsDataURL(file);
    }
  }, [onFileSelect, showPreview, validateFile]);  

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;

    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }, [disabled, handleFileSelect]);

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  }, [handleFileSelect]);

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const getPlaceholder = () => {
    if (placeholder) return placeholder;
    
    switch (variant) {
      case 'avatar':
        return 'Click to upload or drag and drop your profile picture';
      case 'compact':
        return 'Upload file';
      default:
        return 'Click to upload or drag and drop files here';
    }
  };

  const getAcceptedTypesText = () => {
    if (acceptedTypes.includes('image/*')) {
      return 'JPG, PNG, GIF or WebP';
    }
    return acceptedTypes.join(', ');
  };

  const getDropZoneClasses = () => {
    return cn(
      'relative border-2 border-dashed rounded-lg transition-all duration-200',
      {
        'border-primary bg-primary/5': isDragOver && !disabled,
        'border-destructive bg-destructive/5': error,
        'border-green-500 bg-green-50': success,
        'border-muted-foreground/25 hover:border-muted-foreground/50': !isDragOver && !error && !success && !disabled,
        'border-muted-foreground/10 opacity-50 cursor-not-allowed': disabled,
        'cursor-pointer': !disabled,
        'p-6': variant === 'default',
        'p-4': variant === 'avatar',
        'p-3': variant === 'compact',
      },
      className
    );
  };

  return (
    <div className="space-y-2">
      <div
        className={getDropZoneClasses()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="File upload area"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileInputChange}
          accept={acceptedTypes.join(',')}
          multiple={multiple}
          disabled={disabled}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center text-center">
          {preview && variant === 'avatar' ? (
            <div className="relative mb-4">
              <img
                src={preview}
                alt="Preview"
                className="w-16 h-16 rounded-full object-cover border-2 border-muted"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="mb-4">
              {variant === 'avatar' ? (
                <Camera className="h-8 w-8 text-muted-foreground" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
          )}

          {isUploading ? (
            <div className="w-full max-w-xs">
              <Progress value={uploadProgress} className="mb-2" />
              <p className="text-sm text-muted-foreground">
                Uploading... {uploadProgress}%
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground mb-1">
                {getPlaceholder()}
              </p>
              <p className="text-xs text-muted-foreground">
                {getAcceptedTypesText()} (max {formatFileSize(maxSize)})
              </p>
            </>
          )}

          {selectedFile && !isUploading && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Image className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium truncate">
                  {selectedFile.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({formatFileSize(selectedFile.size)})
                </span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
            <div className="text-center">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-green-600 font-medium">Upload successful!</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}