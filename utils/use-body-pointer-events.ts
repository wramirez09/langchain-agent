import { useEffect } from 'react';

export function useBodyPointerEvents(shouldDisable: boolean) {
  useEffect(() => {
    if (shouldDisable) {
      document.body.style.pointerEvents = 'none';
    } else {
      document.body.style.pointerEvents = 'auto';
    }

    // Cleanup function to reset pointer-events when the component unmounts
    return () => {
      document.body.style.pointerEvents = 'auto';
    };
  }, [shouldDisable]);
}
