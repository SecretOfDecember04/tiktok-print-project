"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;          // 目标值
  duration?: number;      // 动画时长（ms）
  decimals?: number;      // 保留小数位
  prefix?: string;        // 前缀，如 $
  suffix?: string;        // 后缀
  easing?: (t: number) => number; // 自定义缓动
  separator?: string;     // 千分位分隔符，默认 ","
};

const defaultEasing = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic

export default function CountUp({
  value,
  duration = 1000,
  decimals = 0,
  prefix = "",
  suffix = "",
  easing = defaultEasing,
  separator = ",",
}: Props) {
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;             // 也可以改成上一次的 display
    const to = value;
    startRef.current = start;

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = easing(t);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, easing]);

  // 千分位 & 小数
  const formatted = (() => {
    const parts = display.toFixed(decimals).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return `${prefix}${parts.join(".")}${suffix}`;
  })();

  return <span>{formatted}</span>;
}