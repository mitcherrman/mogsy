import { motion } from "framer-motion";

export default function SwipeReadyOverlay() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.3, delay: 0.5 }}
      className="absolute inset-0 z-50 bg-background/40 backdrop-blur-[2px] pointer-events-auto"
    />
  );
}
