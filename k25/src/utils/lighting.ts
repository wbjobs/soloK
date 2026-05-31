export interface LightingInfo {
  brightness: number;
  isLowLight: boolean;
  isBacklit: boolean;
  quality: 'excellent' | 'good' | 'poor' | 'bad';
  recommendation: string;
}

export class LightingDetector {
  private sampleSize: number = 50;

  analyze(imageData: ImageData): LightingInfo {
    const { data, width, height } = imageData;
    let totalBrightness = 0;
    let brightPixels = 0;
    let darkPixels = 0;
    let edgeBrightness = 0;
    let centerBrightness = 0;
    let edgePixels = 0;
    let centerPixels = 0;

    const centerX1 = width * 0.25;
    const centerX2 = width * 0.75;
    const centerY1 = height * 0.25;
    const centerY2 = height * 0.75;

    const stepX = Math.floor(width / this.sampleSize);
    const stepY = Math.floor(height / this.sampleSize);

    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;

        totalBrightness += brightness;

        if (brightness > 200) brightPixels++;
        if (brightness < 50) darkPixels++;

        if (x < centerX1 || x > centerX2 || y < centerY1 || y > centerY2) {
          edgeBrightness += brightness;
          edgePixels++;
        } else {
          centerBrightness += brightness;
          centerPixels++;
        }
      }
    }

    const totalPixels = Math.ceil(width / stepX) * Math.ceil(height / stepY);
    const avgBrightness = totalBrightness / totalPixels;
    const avgEdge = edgePixels > 0 ? edgeBrightness / edgePixels : 0;
    const avgCenter = centerPixels > 0 ? centerBrightness / centerPixels : 0;

    const brightRatio = brightPixels / totalPixels;
    const darkRatio = darkPixels / totalPixels;

    let isLowLight = avgBrightness < 50 || darkRatio > 0.5;
    let isBacklit = avgEdge > avgCenter * 1.8 && avgCenter < 80;

    let quality: LightingInfo['quality'] = 'excellent';
    let recommendation = '照明条件良好';

    if (avgBrightness < 30 || darkRatio > 0.7) {
      quality = 'bad';
      isLowLight = true;
      recommendation = '光照严重不足，检测可能失效';
    } else if (avgBrightness < 50 || darkRatio > 0.5) {
      quality = 'poor';
      isLowLight = true;
      recommendation = '光照不足，建议增加照明';
    } else if (isBacklit) {
      quality = 'poor';
      recommendation = '存在背光问题，检测效果下降';
    } else if (avgBrightness < 80 || brightRatio > 0.3) {
      quality = 'good';
      recommendation = '照明条件一般';
    }

    return {
      brightness: avgBrightness,
      isLowLight,
      isBacklit,
      quality,
      recommendation
    };
  }

  estimateLux(brightness: number): number {
    return Math.round((brightness / 255) * 1000);
  }
}

export const getDetectionSensitivity = (lighting: LightingInfo): number => {
  switch (lighting.quality) {
    case 'excellent':
      return 1.0;
    case 'good':
      return 0.8;
    case 'poor':
      return 0.5;
    case 'bad':
      return 0.3;
    default:
      return 1.0;
  }
};
