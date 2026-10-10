"use client";

import { motion, type HTMLMotionProps, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

/** Shared easing: soft, slightly springy "cleaning swipe". */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: EASE } },
};

export const staggerContainer = (stagger = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/** Fade + rise on mount. */
export function FadeIn({ delay = 0, className, children, ...props }: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.55, ease: EASE, delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Container that staggers its <StaggerItem> children. */
export function Stagger({ className, children, stagger = 0.06, delay = 0, ...props }: HTMLMotionProps<"div"> & { stagger?: number; delay?: number }) {
  return (
    <motion.div variants={staggerContainer(stagger, delay)} initial="hidden" animate="show" className={className} {...props}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ className, children, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={fadeUp} className={cn(className)} {...props}>
      {children}
    </motion.div>
  );
}

/** Table/list row variant — use with <Stagger> or as motion.tr variants. */
export const rowVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/** Press feedback for custom clickable cards. */
export const pressable = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.985 },
  transition: { type: "spring", stiffness: 420, damping: 30 },
} as const;
