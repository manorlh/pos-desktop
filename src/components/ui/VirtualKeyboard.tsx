import { useState, useEffect, useRef } from 'react';
import { X, Languages } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface VirtualKeyboardProps {
  isOpen: boolean;
  onClose: () => void;
  onInput: (value: string) => void;
  inputType?: 'text' | 'number' | 'numeric';
  currentValue?: string;
}

type Language = 'hebrew' | 'english';

export function VirtualKeyboard({ 
  isOpen, 
  onClose, 
  onInput, 
  inputType = 'text',
  currentValue = '' 
}: VirtualKeyboardProps) {
  const [input, setInput] = useState(currentValue);
  const [isShift, setIsShift] = useState(false);
  const [language, setLanguage] = useState<Language>('hebrew'); // Default to Hebrew
  const keyboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(currentValue);
  }, [currentValue, isOpen]);

  useEffect(() => {
    if (isOpen && keyboardRef.current) {
      keyboardRef.current.focus();
      // Reset to Hebrew default when keyboard first opens
      if (inputType === 'text') {
        setLanguage('hebrew');
        setIsShift(false);
      }
    }
  }, [isOpen, inputType]);

  const handleKeyPress = (key: string) => {
    let newInput = input;

    if (key === 'Backspace') {
      newInput = input.slice(0, -1);
    } else if (key === 'Space') {
      newInput = input + ' ';
    } else if (key === 'Enter') {
      onInput(input);
      onClose();
      return;
    } else if (key === 'Shift') {
      setIsShift(!isShift);
      return;
    } else if (key === 'Clear') {
      newInput = '';
    } else {
      // For Hebrew, characters are already in the correct case
      // For English, apply shift logic
      const char = language === 'english' && isShift && /[a-z]/.test(key) 
        ? key.toUpperCase() 
        : key;
      
      // Always append characters (browser handles RTL display via dir attribute)
      newInput = input + char;
    }

    setInput(newInput);
    onInput(newInput);
  };

  // Numeric keyboard layout
  const numericLayout = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['0', '.', 'Backspace'],
  ];

  // Hebrew keyboard layout (QWERTY-based Hebrew)
  const hebrewLayout = isShift
    ? [
        ['/', '׳', 'ק', 'ר', 'א', 'ט', 'ו', 'ן', 'ם', 'פ'],
        ['ש', 'ד', 'ג', 'כ', 'ע', 'י', 'ח', 'ל', 'ך', 'ף'],
        ['Shift', 'ז', 'ס', 'ב', 'ה', 'נ', 'מ', 'צ', 'ת', 'ץ', 'Backspace'],
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Space', '-', '_', '.', ',', 'Enter'],
      ]
    : [
        ['/', '׳', 'ק', 'ר', 'א', 'ט', 'ו', 'ן', 'ם', 'פ'],
        ['ש', 'ד', 'ג', 'כ', 'ע', 'י', 'ח', 'ל', 'ך', 'ף'],
        ['Shift', 'ז', 'ס', 'ב', 'ה', 'נ', 'מ', 'צ', 'ת', 'ץ', 'Backspace'],
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Space', '-', '_', '.', ',', 'Enter'],
      ];

  // English keyboard layout
  const englishLayout = isShift
    ? [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Backspace'],
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Space', '-', '_', '.', '@', 'Enter'],
      ]
    : [
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Backspace'],
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Space', '-', '_', '.', '@', 'Enter'],
      ];

  // Text keyboard layout based on selected language
  const textLayout = language === 'hebrew' ? hebrewLayout : englishLayout;

  const layout = inputType === 'number' || inputType === 'numeric' ? numericLayout : textLayout;

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" 
      onClick={onClose}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div 
        className="bg-background border-t border-border rounded-t-lg shadow-lg w-full max-w-4xl max-h-[70vh] overflow-auto touch-manipulation"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        ref={keyboardRef}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={input}
              readOnly
              className={cn(
                "w-full px-4 py-2 text-lg border border-input rounded-md bg-background",
                language === 'hebrew' ? 'text-right' : 'text-left'
              )}
              placeholder={language === 'hebrew' ? 'הקלד כאן...' : 'Type here...'}
              dir={language === 'hebrew' ? 'rtl' : 'ltr'}
            />
          </div>
          {inputType === 'text' && (
            <Button
              variant={language === 'hebrew' ? 'default' : 'outline'}
              size="lg"
              onClick={() => {
                setLanguage(language === 'hebrew' ? 'english' : 'hebrew');
                setIsShift(false); // Reset shift when switching languages
              }}
              className="min-w-[120px] touch-manipulation"
            >
              <Languages className="h-4 w-4 mr-2" />
              {language === 'hebrew' ? 'עברית' : 'English'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="touch-manipulation"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Keyboard */}
        <div className="p-4">
          {layout.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-2 mb-2 justify-center">
              {row.map((key) => {
                const isSpecial = ['Backspace', 'Enter', 'Shift', 'Space', 'Clear'].includes(key);
                const isWide = key === 'Space' || key === 'Enter' || key === 'Backspace';
                
                return (
                  <Button
                    key={key}
                    variant={isShift && key === 'Shift' ? 'default' : 'outline'}
                    size="lg"
                    className={cn(
                      'min-w-[60px] h-16 text-lg font-semibold touch-manipulation',
                      isWide && 'flex-1 max-w-[200px]',
                      isSpecial && 'bg-muted hover:bg-muted/80',
                      'active:scale-95 transition-transform'
                    )}
                    onClick={() => handleKeyPress(key)}
                    onTouchStart={(e) => {
                      // Prevent double-tap zoom on mobile
                      e.currentTarget.style.transform = 'scale(0.95)';
                    }}
                    onTouchEnd={(e) => {
                      e.currentTarget.style.transform = '';
                    }}
                  >
                    {key === 'Backspace' ? '⌫' : 
                     key === 'Enter' ? '✓' :
                     key === 'Shift' ? '⇧' :
                     key === 'Space' ? 'Space' :
                     key === 'Clear' ? 'Clear' :
                     key}
                  </Button>
                );
              })}
            </div>
          ))}
          
          {/* Action buttons */}
          <div className="flex gap-2 mt-4" dir={language === 'hebrew' ? 'rtl' : 'ltr'}>
            <Button
              variant="outline"
              size="lg"
              className="flex-1 h-16 text-lg font-semibold touch-manipulation"
              onClick={() => {
                setInput('');
                onInput('');
              }}
            >
              {language === 'hebrew' ? 'נקה' : 'Clear'}
            </Button>
            <Button
              variant="default"
              size="lg"
              className="flex-1 h-16 text-lg font-semibold touch-manipulation"
              onClick={() => {
                onInput(input);
                onClose();
              }}
            >
              {language === 'hebrew' ? 'סיום' : 'Done'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

