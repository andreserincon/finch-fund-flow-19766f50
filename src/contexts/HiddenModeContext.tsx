import { createContext, useContext, useState, ReactNode } from 'react';

interface HiddenModeContextType {
  hiddenMode: boolean;
  toggleHiddenMode: () => void;
  displayName: (fullName: string, matricula?: string | null) => string;
}

const HiddenModeContext = createContext<HiddenModeContextType>({
  hiddenMode: false,
  toggleHiddenMode: () => {},
  displayName: (name) => name,
});

export function HiddenModeProvider({ children }: { children: ReactNode }) {
  const [hiddenMode, setHiddenMode] = useState(false);

  const toggleHiddenMode = () => setHiddenMode((prev) => !prev);

  const displayName = (fullName: string, matricula?: string | null) => {
    if (!hiddenMode) return fullName;
    return matricula ? `Mat. ${matricula}` : '***';
  };

  return (
    <HiddenModeContext.Provider value={{ hiddenMode, toggleHiddenMode, displayName }}>
      {children}
    </HiddenModeContext.Provider>
  );
}

export const useHiddenMode = () => useContext(HiddenModeContext);
