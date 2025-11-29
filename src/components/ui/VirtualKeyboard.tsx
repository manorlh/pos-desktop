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
  const [keyboardHeight, setKeyboardHeight] = useState(400);

  useEffect(() => {
    // Sync with current value when keyboard opens or value changes
    setInput(currentValue);
  }, [currentValue, isOpen]);

  // Measure and update keyboard height after render
  useEffect(() => {
    if (isOpen && keyboardRef.current) {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      const measureHeight = () => {
        if (keyboardRef.current) {
          const height = keyboardRef.current.offsetHeight;
          setKeyboardHeight(height);
          document.documentElement.style.setProperty('--keyboard-height', `${height}px`);
        }
      };
      
      // Measure after a short delay to ensure layout is complete
      requestAnimationFrame(() => {
        requestAnimationFrame(measureHeight);
      });
      
      // Also measure on window resize for responsive behavior
      const handleResize = () => {
        measureHeight();
      };
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    } else {
      document.documentElement.style.setProperty('--keyboard-height', '0px');
    }
  }, [isOpen]);

  // Sync with physical keyboard input in real-time
  useEffect(() => {
    if (isOpen) {
      // Sync value from physical keyboard in real-time
      // Track the currently focused input dynamically
      const syncInterval = setInterval(() => {
        const activeElement = document.activeElement as HTMLInputElement;
        if (activeElement && activeElement.tagName === 'INPUT' && activeElement.type !== 'file') {
          // Sync value if it changed
          if (activeElement.value !== input) {
            setInput(activeElement.value);
            onInput(activeElement.value);
          }
        }
      }, 100);
      
      // Listen to input events on all inputs for immediate sync
      const handleInput = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target && target.tagName === 'INPUT' && target.type !== 'file' && target === document.activeElement) {
          if (target.value !== input) {
            setInput(target.value);
            onInput(target.value);
          }
        }
      };
      
      // Add event listener to document to catch all input events
      document.addEventListener('input', handleInput, true);
      
      return () => {
        clearInterval(syncInterval);
        document.removeEventListener('input', handleInput, true);
      };
    }
  }, [isOpen, input, onInput]);

  useEffect(() => {
    if (isOpen) {
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

  return (
    <div 
      data-virtual-keyboard
      className="fixed bottom-0 left-0 right-0 z-[102] bg-background border-t border-border shadow-2xl w-full max-w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[560px] overflow-auto touch-manipulation mx-auto transition-transform duration-300 ease-out"
      style={{
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        visibility: isOpen ? 'visible' : 'hidden',
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 1.5rem)`,
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      ref={keyboardRef}
      tabIndex={-1}
    >
        {/* Header */}
        <div className="flex items-center justify-between p-2 sm:p-3 md:p-4 border-b border-border gap-2">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={input}
              readOnly
              className={cn(
                "w-full px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-sm sm:text-base md:text-lg border border-input rounded-md bg-background",
                language === 'hebrew' ? 'text-right' : 'text-left'
              )}
              placeholder={language === 'hebrew' ? 'הקלד כאן...' : 'Type here...'}
              dir={language === 'hebrew' ? 'rtl' : 'ltr'}
              onKeyDown={(e) => {
                // Allow physical keyboard to work on the actual input field
                // This is just a display, so we don't need to handle keys here
                e.stopPropagation();
              }}
            />
          </div>
          {inputType === 'text' && (
            <Button
              variant={language === 'hebrew' ? 'default' : 'outline'}
              size="sm"
              className="sm:size-lg touch-manipulation min-w-[80px] sm:min-w-[100px] md:min-w-[120px] text-xs sm:text-sm md:text-base px-2 sm:px-3 md:px-4"
              onClick={() => {
                setLanguage(language === 'hebrew' ? 'english' : 'hebrew');
                setIsShift(false); // Reset shift when switching languages
              }}
            >
              <Languages className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{language === 'hebrew' ? 'עברית' : 'English'}</span>
              <span className="sm:hidden">{language === 'hebrew' ? 'עב' : 'EN'}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="touch-manipulation h-8 w-8 sm:h-10 sm:w-10"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>

        {/* Keyboard */}
        <div className="p-2 sm:p-3 md:p-4 pb-4 sm:pb-5 md:pb-6">
          {layout.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1 sm:gap-1.5 md:gap-2 mb-1 sm:mb-1.5 md:mb-2 justify-center flex-wrap">
              {row.map((key) => {
                const isSpecial = ['Backspace', 'Enter', 'Shift', 'Space', 'Clear'].includes(key);
                const isWide = key === 'Space' || key === 'Enter' || key === 'Backspace';
                
                return (
                  <Button
                    key={key}
                    variant={isShift && key === 'Shift' ? 'default' : 'outline'}
                    className={cn(
                      'touch-manipulation active:scale-95 transition-transform font-semibold',
                      // Responsive sizing
                      'min-w-[40px] sm:min-w-[50px] md:min-w-[60px] lg:min-w-[70px]',
                      'h-10 sm:h-12 md:h-14 lg:h-16',
                      'text-xs sm:text-sm md:text-base lg:text-lg',
                      'px-1 sm:px-2 md:px-3',
                      // Wide buttons
                      isWide && 'flex-1 max-w-[120px] sm:max-w-[150px] md:max-w-[180px] lg:max-w-[200px]',
                      isSpecial && 'bg-muted hover:bg-muted/80'
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
                     key === 'Space' ? (
                       <>
                         <span className="hidden sm:inline">Space</span>
                         <span className="sm:hidden">␣</span>
                       </>
                     ) :
                     key === 'Clear' ? 'Clear' :
                     key}
                  </Button>
                );
              })}
            </div>
          ))}
          
          {/* Action buttons */}
          <div className="flex gap-2 sm:gap-3 mt-2 sm:mt-3 md:mt-4 mb-0" dir={language === 'hebrew' ? 'rtl' : 'ltr'}>
            <Button
              variant="outline"
              className="flex-1 touch-manipulation h-10 sm:h-12 md:h-14 lg:h-16 text-xs sm:text-sm md:text-base lg:text-lg font-semibold"
              onClick={() => {
                setInput('');
                onInput('');
              }}
            >
              {language === 'hebrew' ? 'נקה' : 'Clear'}
            </Button>
            <Button
              variant="default"
              className="flex-1 touch-manipulation h-10 sm:h-12 md:h-14 lg:h-16 text-xs sm:text-sm md:text-base lg:text-lg font-semibold"
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
  );
}

