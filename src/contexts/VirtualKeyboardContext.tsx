import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { VirtualKeyboard } from '@/components/ui/VirtualKeyboard';

interface VirtualKeyboardContextType {
  openKeyboard: (onInput: (value: string) => void, inputType?: 'text' | 'number' | 'numeric', currentValue?: string) => void;
  closeKeyboard: () => void;
  isOpen: boolean;
  keyboardHeight: number;
}

const VirtualKeyboardContext = createContext<VirtualKeyboardContextType | undefined>(undefined);

export function VirtualKeyboardProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [onInputCallback, setOnInputCallback] = useState<((value: string) => void) | null>(null);
  const [inputType, setInputType] = useState<'text' | 'number' | 'numeric'>('text');
  const [currentValue, setCurrentValue] = useState('');

  // Listen for keyboard height changes from CSS variable
  useEffect(() => {
    const updateHeight = () => {
      const height = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height') || '0');
      setKeyboardHeight(height);
    };
    
    // Check height periodically when keyboard is open
    let interval: NodeJS.Timeout | null = null;
    if (isOpen) {
      interval = setInterval(updateHeight, 100);
    }
    
    updateHeight();
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      document.body.style.paddingBottom = '0px';
    };
  }, []);

  const openKeyboard = (
    onInput: (value: string) => void,
    type: 'text' | 'number' | 'numeric' = 'text',
    value: string = ''
  ) => {
    setOnInputCallback(() => onInput);
    setInputType(type);
    setCurrentValue(value);
    setIsOpen(true);
  };

  const closeKeyboard = () => {
    setIsOpen(false);
    setOnInputCallback(null);
    setCurrentValue('');
  };

  const handleInput = (value: string) => {
    if (onInputCallback) {
      onInputCallback(value);
    }
  };

  return (
    <VirtualKeyboardContext.Provider value={{ openKeyboard, closeKeyboard, isOpen, keyboardHeight }}>
      {children}
      <VirtualKeyboard
        isOpen={isOpen}
        onClose={closeKeyboard}
        onInput={handleInput}
        inputType={inputType}
        currentValue={currentValue}
      />
    </VirtualKeyboardContext.Provider>
  );
}

export function useVirtualKeyboard() {
  const context = useContext(VirtualKeyboardContext);
  if (context === undefined) {
    throw new Error('useVirtualKeyboard must be used within a VirtualKeyboardProvider');
  }
  return context;
}

