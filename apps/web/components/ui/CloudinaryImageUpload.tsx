'use client';

import { useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const API_BASE_URL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export interface UploadedCloudinaryImage {
  publicId: string;
  secureUrl: string;
  resourceType: 'image';
  format: string;
  width: number;
  height: number;
  bytes: number;
  altText?: string;
}

interface CloudinaryImageUploadProps {
  value: UploadedCloudinaryImage[];
  onChange: (images: UploadedCloudinaryImage[]) => void;
  maxImages?: number;
}

interface SignatureResponse {
  data: { timestamp: number; signature: string; apiKey: string; cloudName: string; folder: string };
}

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('That file could not be read as an image.'));
    image.src = URL.createObjectURL(file);
  });
}

export function CloudinaryImageUpload({
  value,
  onChange,
  maxImages = 10,
}: CloudinaryImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);

  const uploadFile = async (file: File) => {
    setError(null);
    setRetryFile(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Choose a JPG, PNG, WEBP, or GIF image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Images must be smaller than 50 MB.');
      return;
    }

    try {
      const dimensions = await readDimensions(file);
      if (dimensions.width > 20000 || dimensions.height > 20000) {
        throw new Error('Images must be no larger than 20,000 pixels on either side.');
      }
      const signatureResponse = await fetch(
        `${API_BASE_URL}/v1/studio/uploads/cloudinary-signature`,
        {
          credentials: 'include',
        },
      );
      if (!signatureResponse.ok) throw new Error('Unable to prepare the image upload.');
      const signature = (await signatureResponse.json()) as SignatureResponse;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signature.data.apiKey);
      formData.append('timestamp', String(signature.data.timestamp));
      formData.append('signature', signature.data.signature);
      formData.append('folder', signature.data.folder);

      setUploading(true);
      setProgress(0);
      const uploaded = await new Promise<UploadedCloudinaryImage>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open(
          'POST',
          `https://api.cloudinary.com/v1_1/${signature.data.cloudName}/image/upload`,
        );
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => {
          if (request.status < 200 || request.status >= 300) {
            reject(new Error('Cloudinary could not upload that image.'));
            return;
          }
          const result = JSON.parse(request.responseText) as {
            public_id: string;
            secure_url: string;
            resource_type: 'image';
            format: string;
            width: number;
            height: number;
            bytes: number;
          };
          resolve({
            publicId: result.public_id,
            secureUrl: result.secure_url,
            resourceType: result.resource_type,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
          });
        };
        request.onerror = () =>
          reject(new Error('The image upload failed. Check your connection and retry.'));
        request.send(formData);
      });
      onChange([...value, uploaded]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The image upload failed.');
      setRetryFile(file);
    } finally {
      setUploading(false);
    }
  };

  const chooseFiles = (files: FileList | null) => {
    if (!files || uploading) return;
    const remaining = maxImages - value.length;
    Array.from(files)
      .slice(0, remaining)
      .forEach((file) => void uploadFile(file));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-xs uppercase text-[rgb(var(--muted))] font-mono">
            Artwork Images
          </label>
          <p className="text-xs text-[rgb(var(--muted))] mt-1">
            Upload clear photos of your artwork.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || value.length >= maxImages}
          className="px-4 py-2 text-sm border border-[rgb(var(--border)/0.2)] rounded transition-colors hover:bg-[rgb(var(--surface-raised))] disabled:opacity-50"
        >
          + Add Photos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          hidden
          onChange={(event) => chooseFiles(event.target.files)}
        />
      </div>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          chooseFiles(event.dataTransfer.files);
        }}
        className="min-h-28 border border-dashed border-[rgb(var(--border)/0.2)] rounded p-3 flex flex-wrap gap-3"
      >
        {value.map((image, index) => (
          <div
            key={image.publicId}
            className="relative w-24 h-24 rounded overflow-hidden bg-[rgb(var(--background))]"
          >
            <img
              src={image.secureUrl}
              alt="Artwork preview"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              aria-label={`Remove image ${index + 1}`}
              onClick={() => onChange(value.filter((_, imageIndex) => imageIndex !== index))}
              className="absolute top-1 right-1 bg-black/70 text-white w-6 h-6 rounded-full"
            >
              x
            </button>
          </div>
        ))}
        {value.length === 0 && !uploading && (
          <p className="m-auto text-sm text-[rgb(var(--muted))]">Choose or drop a photo here</p>
        )}
        {uploading && (
          <p className="m-auto text-sm text-[rgb(var(--muted))]">Uploading image... {progress}%</p>
        )}
      </div>
      {error && (
        <div className="flex items-center justify-between text-sm text-red-400">
          <span>{error}</span>
          {retryFile && (
            <button type="button" onClick={() => void uploadFile(retryFile)} className="underline">
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
