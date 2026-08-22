import React, { useEffect, useState, useRef } from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';

interface AnimatedNumberProps extends TextProps {
  value: number;
  formatter?: (val: number) => string;
}

// A 100% crash-proof JS thread animated number (bypasses Reanimated worklet issues)
export default function AnimatedNumber({ value, formatter, style, ...props }: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    // If the difference is small or we are initializing, jump immediately
    if (Math.abs(displayValue - value) < 1) {
      setDisplayValue(value);
      return;
    }

    let startTimestamp: number;
    const duration = 250;
    const startValue = displayValue;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // Simple ease-out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      setDisplayValue(startValue + (value - startValue) * easeProgress);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(step);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [value]);

  const formattedText = formatter ? formatter(Math.round(displayValue)) : Math.round(displayValue).toString();

  return (
    <Text {...props} style={[styles.text, style]}>
      {formattedText}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    padding: 0,
    margin: 0,
    includeFontPadding: false,
  },
});
