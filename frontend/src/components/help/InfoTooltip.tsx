import { Tooltip } from '../ui/tooltip';

type InfoTooltipProps = {
  content: string;
};

export function InfoTooltip({ content }: InfoTooltipProps) {
  return (
    <Tooltip content={content}>
      <span className="text-xs text-muted-foreground"></span>
    </Tooltip>
  );
}
