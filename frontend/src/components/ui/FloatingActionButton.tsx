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
      className="pointer-events-none fixed inset-x-0 z-45 flex justify-center sm:hidden"
      style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 0.5rem) + 1.55rem)' }}
    >
      <motion.button
        type="button"
        aria-label={ariaLabel}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border-6 border-white bg-primary text-primary-foreground ring-4 ring-white transition-transform duration-200 elevation-2"
        style={{
          boxShadow:
            'inset 0 -12px 18px rgba(29, 78, 216, 0.65), inset 0 3px 7px rgba(255, 255, 255, 0.24), inset 0 0 10px rgba(37, 99, 235, 0.2), var(--elevation-2)',
        }}
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
