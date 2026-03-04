import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';

type UnsavedChangesContextValue = {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
  setSaveCallback: (cb: (() => Promise<boolean>) | null) => void;
  requestNavigation: (path: string) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | undefined>(undefined);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const saveCallbackRef = useRef<(() => Promise<boolean>) | null>(null);

  const setSaveCallback = useCallback((cb: (() => Promise<boolean>) | null) => {
    saveCallbackRef.current = cb;
  }, []);

  const requestNavigation = useCallback((path: string) => {
    setPendingPath(path);
  }, []);

  const confirmLeave = useCallback(() => {
    if (pendingPath) {
      navigate(pendingPath);
      setPendingPath(null);
    }
  }, [navigate, pendingPath]);

  const cancelLeave = useCallback(() => {
    setPendingPath(null);
  }, []);

  const handleSaveAndNavigate = useCallback(async () => {
    const path = pendingPath;
    const save = saveCallbackRef.current;
    let success = false;
    if (save) {
      success = await save();
    }
    setPendingPath(null);
    if (success && path) {
      navigate(path);
    }
  }, [navigate, pendingPath]);

  const value: UnsavedChangesContextValue = {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    setSaveCallback,
    requestNavigation,
  };

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <Dialog open={!!pendingPath} onOpenChange={(open) => !open && cancelLeave()}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>שינויים לא נשמרו</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ביצעת שינויים בהגדרות המחירים ולא שמרת. אם תעזוב עכשיו, השינויים לא יישמרו.
          </p>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={handleSaveAndNavigate}>
              שמור שינויים
            </Button>
            <Button variant="destructive" onClick={confirmLeave}>
              עזוב בלי לשמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) return { hasUnsavedChanges: false, setHasUnsavedChanges: () => {}, setSaveCallback: () => {}, requestNavigation: () => {} };
  return ctx;
}
