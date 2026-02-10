"use client";

import { useState, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { IconZoomIn, IconZoomOut, IconRotateClockwise, IconX, IconCheck, IconLoader2 } from "@tabler/icons-react";

interface PhotoEditorProps {
  image: string;
  onSave: (croppedImage: string) => Promise<void>;
  onCancel: () => void;
  aspectRatio?: number;
}

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function PhotoEditor({ image, onSave, onCancel, aspectRatio = 2 / 3 }: PhotoEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Validate image when it changes
  useEffect(() => {
    if (!image) {
      setImageError("No image provided");
      return;
    }
    
    // Check if it's a data URL or regular URL
    const isDataUrl = image.startsWith("data:image");
    const isUrl = image.startsWith("http://") || image.startsWith("https://");
    
    console.log("PhotoEditor received image:", {
      type: isDataUrl ? "data URL" : isUrl ? "URL" : "unknown",
      length: image.length,
      preview: image.substring(0, 100) + "..."
    });
    
    // Validate data URL format
    if (isDataUrl) {
      const dataUrlMatch = image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!dataUrlMatch) {
        setImageError("Invalid image format. Please try uploading again.");
        return;
      }
      const [, format, base64Data] = dataUrlMatch;
      if (!base64Data || base64Data.length < 100) {
        setImageError("Image data is too small or corrupted. Please try uploading again.");
        return;
      }
      console.log("Data URL validated:", { format, dataLength: base64Data.length });
    }
    
    // Test if image loads
    const testImg = new Image();
    let timeoutId: NodeJS.Timeout;
    
    testImg.onload = () => {
      clearTimeout(timeoutId);
      console.log("Image loaded successfully, dimensions:", testImg.width, "x", testImg.height);
      if (testImg.width === 0 || testImg.height === 0) {
        setImageError("Image has invalid dimensions. Please try uploading again.");
        return;
      }
      setImageError(null);
    };
    
    testImg.onerror = (error) => {
      clearTimeout(timeoutId);
      console.error("Failed to load image:", error);
      if (isDataUrl) {
        setImageError("Failed to load image. The file may be corrupted. Please try uploading a different image.");
      } else if (isUrl) {
        setImageError("Failed to load image from URL. Please check your internet connection or try uploading again.");
      } else {
        setImageError("Failed to load image. Please try uploading again.");
      }
    };
    
    // Set a timeout for image loading (10 seconds)
    timeoutId = setTimeout(() => {
      testImg.onerror = null; // Prevent double error
      setImageError("Image took too long to load. Please try uploading again.");
    }, 10000);
    
    testImg.src = image;
    
    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      testImg.onload = null;
      testImg.onerror = null;
    };
  }, [image]);

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", (error) => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
    rotation: number = 0
  ): Promise<string> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("No 2d context");
    }

    const maxSize = Math.max(image.width, image.height);
    const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

    canvas.width = safeArea;
    canvas.height = safeArea;

    ctx.translate(safeArea / 2, safeArea / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-safeArea / 2, -safeArea / 2);

    ctx.drawImage(
      image,
      safeArea / 2 - image.width * 0.5,
      safeArea / 2 - image.height * 0.5
    );

    const data = ctx.getImageData(0, 0, safeArea, safeArea);

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.putImageData(
      data,
      Math.round(0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x),
      Math.round(0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y)
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty"));
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.95);
    });
  };

  const handleSave = async () => {
    if (!croppedAreaPixels || isSaving) return;
    
    try {
      setIsSaving(true);
      const croppedImage = await getCroppedImg(image, croppedAreaPixels, rotation);
      await onSave(croppedImage);
    } catch (error) {
      console.error("Error cropping image:", error);
      setIsSaving(false);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.1, 1));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-4xl bg-background rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Edit Photo</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="h-8 w-8"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>

        {/* Cropper */}
        <div className="relative w-full" style={{ height: "500px", background: "#000" }}>
          {imageError ? (
            <div className="flex items-center justify-center h-full text-destructive">
              <div className="text-center">
                <p className="text-lg font-semibold mb-2">Image Error</p>
                <p className="text-sm">{imageError}</p>
              </div>
            </div>
          ) : image ? (
            <Cropper
              image={image}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspectRatio}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              cropShape="rect"
              showGrid={true}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>No image to display</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 border-t space-y-4">
          {/* Zoom Controls */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium min-w-[80px]">Zoom:</span>
            <div className="flex items-center gap-2 flex-1">
              <Button
                variant="outline"
                size="icon"
                onClick={handleZoomOut}
                disabled={zoom <= 1}
              >
                <IconZoomOut className="h-4 w-4" />
              </Button>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
              >
                <IconZoomIn className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[50px] text-right">
                {Math.round(zoom * 100)}%
              </span>
            </div>
          </div>

          {/* Rotation Control */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium min-w-[80px]">Rotation:</span>
            <div className="flex items-center gap-2 flex-1">
              <Button
                variant="outline"
                size="icon"
                onClick={handleRotate}
              >
                <IconRotateClockwise className="h-4 w-4" />
              </Button>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground min-w-[50px] text-right">
                {rotation}°
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !croppedAreaPixels}>
              {isSaving ? (
                <>
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <IconCheck className="h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}



