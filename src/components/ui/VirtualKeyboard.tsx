import { useState, useEffect, useRef, useCallback } from 'react';
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
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

  const isEditableField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement => {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    const type = (el as HTMLInputElement).type;
    return type !== 'file' && type !== 'checkbox' && type !== 'radio' && type !== 'hidden';
  };

  const syncFromActiveElement = useCallback(() => {
    const activeElement = document.activeElement;
    if (!isEditableField(activeElement)) return;
    const newValue = activeElement.value;
    setInput((prev) => {
      if (newValue === prev) return prev;
      onInputRef.current(newValue);
      return newValue;
    });
  }, []);

  const scheduleSyncFromActiveElement = useCallback(
    (defer = false) => {
      if (!defer) {
        syncFromActiveElement();
        return;
      }
      // Paste/cut apply to the field after the event handler returns.
      requestAnimationFrame(() => {
        requestAnimationFrame(syncFromActiveElement);
      });
    },
    [syncFromActiveElement],
  );

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

  // Sync with physical keyboard, paste, cut, and other DOM edits while open.
  useEffect(() => {
    if (!isOpen) return;

    const syncInterval = setInterval(syncFromActiveElement, 100);

    const onInputEvent = () => scheduleSyncFromActiveElement(false);
    const onDeferredEdit = () => scheduleSyncFromActiveElement(true);
    const onBeforeInput = (e: Event) => {
      const ie = e as InputEvent;
      if (
        ie.inputType === 'insertFromPaste' ||
        ie.inputType === 'insertFromDrop' ||
        ie.inputType === 'deleteByCut'
      ) {
        scheduleSyncFromActiveElement(true);
      }
    };

    const editEvents = ['input', 'change', 'keyup'] as const;
    const deferredEvents = ['paste', 'cut', 'drop'] as const;

    for (const ev of editEvents) {
      document.addEventListener(ev, onInputEvent, true);
    }
    for (const ev of deferredEvents) {
      document.addEventListener(ev, onDeferredEdit, true);
    }
    document.addEventListener('beforeinput', onBeforeInput, true);

    return () => {
      clearInterval(syncInterval);
      for (const ev of editEvents) {
        document.removeEventListener(ev, onInputEvent, true);
      }
      for (const ev of deferredEvents) {
        document.removeEventListener(ev, onDeferredEdit, true);
      }
      document.removeEventListener('beforeinput', onBeforeInput, true);
    };
  }, [isOpen, syncFromActiveElement, scheduleSyncFromActiveElement]);

  useEffect(() => {
    if (isOpen) {
      // Reset to Hebrew default when keyboard first opens
      if (inputType === 'text') {
        setLanguage('hebrew');
        setIsShift(false);
      }
    }
  }, [isOpen, inputType]);

  // Close keyboard when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      
      // Don't close if clicking on the keyboard itself
      if (keyboardRef.current && keyboardRef.current.contains(target)) {
        return;
      }

      // Don't close if clicking on an input (input focus should keep keyboard open)
      if (target.tagName === 'INPUT' && target.type !== 'file') {
        return;
      }

      // Don't close if clicking on a dialog or select dropdown
      if (
        target.closest('[role="dialog"]') ||
        target.closest('[data-radix-select-content]') ||
        target.closest('[data-radix-popper-content-wrapper]')
      ) {
        return;
      }

      // Close the keyboard when clicking outside
      onClose();
    };

    // Use capture phase to catch events before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [isOpen, onClose]);

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

  // Hebrew keyboard layout (QWERTY-based Hebrew) — number row on top, like a physical keyboard
  const hebrewLayout = isShift
    ? [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['/', '׳', 'ק', 'ר', 'א', 'ט', 'ו', 'ן', 'ם', 'פ'],
        ['ש', 'ד', 'ג', 'כ', 'ע', 'י', 'ח', 'ל', 'ך', 'ף'],
        ['Shift', 'ז', 'ס', 'ב', 'ה', 'נ', 'מ', 'צ', 'ת', 'ץ', 'Backspace'],
        ['Space', '-', '_', '.', ',', 'Enter'],
      ]
    : [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['/', '׳', 'ק', 'ר', 'א', 'ט', 'ו', 'ן', 'ם', 'פ'],
        ['ש', 'ד', 'ג', 'כ', 'ע', 'י', 'ח', 'ל', 'ך', 'ף'],
        ['Shift', 'ז', 'ס', 'ב', 'ה', 'נ', 'מ', 'צ', 'ת', 'ץ', 'Backspace'],
        ['Space', '-', '_', '.', ',', 'Enter'],
      ];

  // English keyboard layout — number row on top, like a physical keyboard
  const englishLayout = isShift
    ? [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Backspace'],
        ['Space', '-', '_', '.', '@', 'Enter'],
      ]
    : [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Backspace'],
        ['Space', '-', '_', '.', '@', 'Enter'],
      ];

  // Text keyboard layout based on selected language
  const textLayout = language === 'hebrew' ? hebrewLayout : englishLayout;

  const layout = inputType === 'number' || inputType === 'numeric' ? numericLayout : textLayout;

  return (
    <div 
      data-virtual-keyboard
      className="fixed bottom-0 left-0 right-0 z-[102] bg-background border-t border-border shadow-2xl w-full max-w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[min(45vh,320px)] short:max-h-[min(38vh,280px)] till:max-h-[min(40vh,300px)] overflow-auto touch-manipulation mx-auto transition-transform duration-300 ease-out"
      style={{
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        visibility: isOpen ? 'visible' : 'hidden',
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 0.75rem)`,
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
        <div className="flex items-center justify-between p-1.5 sm:p-2 short:p-1.5 border-b border-border gap-1.5 sm:gap-2">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={input}
              readOnly
              className={cn(
                "w-full px-2 sm:px-3 py-1 sm:py-1.5 text-[14px] border border-input rounded-md bg-background",
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
              className="touch-manipulation min-w-[60px] sm:min-w-[80px] md:min-w-[100px] text-[14px] px-1.5 sm:px-2 h-7 sm:h-8 md:h-9"
              onClick={() => {
                setLanguage(language === 'hebrew' ? 'english' : 'hebrew');
                setIsShift(false); // Reset shift when switching languages
              }}
            >
              <Languages className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              <span className="hidden sm:inline">{language === 'hebrew' ? 'עברית' : 'English'}</span>
              <span className="sm:hidden">{language === 'hebrew' ? 'עב' : 'EN'}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="touch-manipulation h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9"
          >
            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        </div>

        {/* Keyboard */}
        <div className="p-1.5 sm:p-2 short:p-1.5 pb-2">
          {layout.map((row, rowIndex) => (
            <div key={rowIndex} dir="ltr" className="flex gap-0.5 sm:gap-1 short:gap-0.5 mb-0.5 sm:mb-1 short:mb-0.5 w-full">
              {row.map((key) => {
                const isSpecial = ['Backspace', 'Enter', 'Shift', 'Space', 'Clear'].includes(key);
                const isWide = key === 'Space' || key === 'Enter' || key === 'Backspace';
                
                return (
                  <Button
                    key={key}
                    variant={isShift && key === 'Shift' ? 'default' : 'outline'}
                    className={cn(
                      'touch-manipulation active:scale-95 transition-transform font-semibold',
                      'flex-1 basis-0 min-w-0 px-0.5 sm:px-1',
                      'h-7 sm:h-9 short:h-7 md:h-10',
                      'text-[14px]',
                      isWide && 'flex-[2.5]',
                      key === 'Space' && 'flex-[4]',
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
          <div className="flex gap-1.5 sm:gap-2 md:gap-3 mt-1.5 sm:mt-2 short:mt-1 mb-0" dir={language === 'hebrew' ? 'rtl' : 'ltr'}>
            <Button
              variant="outline"
              className="flex-1 touch-manipulation h-8 sm:h-10 short:h-8 text-[14px] font-semibold"
              onClick={() => {
                setInput('');
                onInput('');
              }}
            >
              {language === 'hebrew' ? 'נקה' : 'Clear'}
            </Button>
            <Button
              variant="default"
              className="flex-1 touch-manipulation h-8 sm:h-10 short:h-8 text-[14px] font-semibold"
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

