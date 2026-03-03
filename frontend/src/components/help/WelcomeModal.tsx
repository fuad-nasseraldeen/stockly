import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

type WelcomeModalProps = {
  open: boolean;
  videoUrl: string;
  onStart: () => void;
  onSkip: () => void;
};

export function WelcomeModal({ open, videoUrl, onStart, onSkip }: WelcomeModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onSkip() : undefined)}>
      <DialogContent className="max-w-2xl w-[95vw] sm:w-full max-h-[95vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>ברוך הבא ל-Stockly</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground shrink-0">
          סרטון של כ־3.5 דקות שיעזור להתחיל מהר עם ייבוא, הגדרות וניהול מחירים.
        </p>
        <div className="overflow-hidden rounded-lg border min-h-[45vh] sm:min-h-[320px] flex-1 flex items-center">
          <iframe
            title="Stockly Welcome"
            src={videoUrl}
            className="aspect-video w-full min-h-[45vh] sm:min-h-[320px]"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onSkip}>
            דלג לעכשיו
          </Button>
          <Button onClick={onStart}>התחל להשתמש</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
