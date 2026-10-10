import React, { createContext, useContext, useState, ReactNode } from 'react';

type AdvancedModeContextType = {
  isAdvancedMode: boolean;
  toggleAdvancedMode: () => void;
};

const AdvancedModeContext = createContext<AdvancedModeContextType | undefined>(undefined);

export const AdvancedModeProvider = ({ children }: { children: ReactNode }) => {
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const toggleAdvancedMode = () => setIsAdvancedMode(!isAdvancedMode);

  return (
    <AdvancedModeContext.Provider value={{ isAdvancedMode, toggleAdvancedMode }}>
      {children}
    </AdvancedModeContext.Provider>
  );
};

export const useAdvancedMode = () => {
  const context = useContext(AdvancedModeContext);
  if (!context) throw new Error('useAdvancedMode must be used within AdvancedModeProvider');
  return context;
};
