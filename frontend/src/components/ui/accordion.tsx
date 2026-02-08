import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AccordionItemProps {
  children: React.ReactNode;
  className?: string;
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  isOpen?: boolean;
}

interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
  isOpen?: boolean;
}

export function AccordionItem({ children, className }: AccordionItemProps) {
  return (
    <div className={cn('border-b border-border', className)}>
      {children}
    </div>
  );
}

export function AccordionTrigger({ children, className, onClick, isOpen = false }: AccordionTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between py-4 px-4 text-left font-medium transition-all hover:bg-muted/50',
        className
      )}
    >
      <div className="flex-1">{children}</div>
      <ChevronDown
        className={cn(
          'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
          isOpen && 'transform rotate-180'
        )}
      />
    </button>
  );
}

export function AccordionContent({ children, className, isOpen = false }: AccordionContentProps) {
  return (
    <div
      className={cn(
        'overflow-hidden transition-all duration-200',
        isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0',
        className
      )}
    >
      <div className="px-4 pb-4 pt-0">{children}</div>
    </div>
  );
}
