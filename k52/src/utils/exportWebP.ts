export function exportToWebP(
  canvas: HTMLCanvasElement,
  quality?: number
): string {
  return canvas.toDataURL('image/webp', quality || 0.8);
}

export function downloadDataURL(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function createThumbnail(
  image: HTMLCanvasElement | HTMLImageElement,
  maxWidth: number = 200
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return '';
  }

  const width = image instanceof HTMLCanvasElement ? image.width : image.naturalWidth;
  const height = image instanceof HTMLCanvasElement ? image.height : image.naturalHeight;

  const ratio = Math.min(maxWidth / width, 1);
  canvas.width = width * ratio;
  canvas.height = height * ratio;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/webp', 0.8);
}
