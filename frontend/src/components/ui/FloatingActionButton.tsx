import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type FloatingActionButtonProps = {
  to: string;
  ariaLabel?: string;
};

export function FloatingActionButton({ to, ariaLabel = 'הוסף מוצר' }: FloatingActionButtonProps) {
  const navigate = useNavigate();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center sm:hidden"
      style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 0.5rem) + 2.75rem)' }}
    >
      <motion.button
        type="button"
        aria-label={ariaLabel}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary text-primary-foreground transition-transform duration-200 elevation-2"
        onClick={() => navigate(to)}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
      >
        <Plus className="h-6 w-6" />
      </motion.button>
    </div>
  );
}
