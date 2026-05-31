import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface WaveformAnimationProps {
  intensity?: number;
  barCount?: number;
  color?: 'primary' | 'success' | 'secondary' | 'accent';
  className?: string;
  height?: number;
}

const colorMap = {
  primary: 'bg-primary',
  success: 'bg-success',
  secondary: 'bg-secondary',
  accent: 'bg-accent',
};

export default function WaveformAnimation({
  intensity = 0,
  barCount = 8,
  color = 'primary',
  className,
  height = 40,
}: WaveformAnimationProps) {
  const normalizedIntensity = Math.max(0, Math.min(1, intensity / 127));
  const bars = Array.from({ length: barCount }, (_, i) => i);

  const getBarHeight = (index: number) => {
    const centerOffset = Math.abs(index - (barCount - 1) / 2);
    const centerFactor = 1 - centerOffset / (barCount / 2);
    const baseHeight = 0.2 + centerFactor * 0.3;
    const animatedHeight = baseHeight + normalizedIntensity * (0.8 - baseHeight);
    return Math.max(0.1, animatedHeight);
  };

  return (
    <div
      className={cn('flex items-end justify-center gap-1', className)}
      style={{ height }}
    >
      {bars.map((index) => (
        <motion.div
          key={index}
          className={cn('w-1 rounded-full', colorMap[color])}
          initial={{ scaleY: 0.1 }}
          animate={{
            scaleY: getBarHeight(index),
            opacity: 0.5 + normalizedIntensity * 0.5,
          }}
          transition={{
            duration: 0.15,
            ease: 'easeOut',
            delay: index * 0.02,
          }}
        />
      ))}
    </div>
  );
}
