import { createContext, useContext, useState, ReactNode } from 'react';
import { VirtualKeyboard } from '@/components/ui/VirtualKeyboard';

interface VirtualKeyboardContextType {
  openKeyboard: (onInput: (value: string) => void, inputType?: 'text' | 'number' | 'numeric', currentValue?: string) => void;
  closeKeyboard: () => void;
}

const VirtualKeyboardContext = createContext<VirtualKeyboardContextType | undefined>(undefined);

export function VirtualKeyboardProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [onInputCallback, setOnInputCallback] = useState<((value: string) => void) | null>(null);
  const [inputType, setInputType] = useState<'text' | 'number' | 'numeric'>('text');
  const [currentValue, setCurrentValue] = useState('');

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
    <VirtualKeyboardContext.Provider value={{ openKeyboard, closeKeyboard }}>
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

