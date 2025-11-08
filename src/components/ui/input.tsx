import * as React from "react"
import { cn } from "@/lib/utils"
import { useVirtualKeyboard } from "@/contexts/VirtualKeyboardContext"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  showVirtualKeyboard?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, showVirtualKeyboard = true, onFocus, value, ...props }, ref) => {
    const { openKeyboard } = useVirtualKeyboard();
    
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      // Only show virtual keyboard for text inputs, not for file inputs, etc.
      if (
        showVirtualKeyboard && 
        type !== 'file' && 
        type !== 'checkbox' && 
        type !== 'radio' &&
        type !== 'hidden'
      ) {
        // Prevent default focus to avoid showing native keyboard on mobile
        e.preventDefault();
        const inputType = type === 'number' ? 'numeric' : 'text';
        openKeyboard(
          (newValue) => {
            // Create a synthetic event to update the input
            const syntheticEvent = {
              target: { value: newValue },
              currentTarget: { value: newValue },
            } as React.ChangeEvent<HTMLInputElement>;
            props.onChange?.(syntheticEvent);
          },
          inputType,
          String(value || '')
        );
      }
      onFocus?.(e);
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={inputRef}
        onFocus={handleFocus}
        value={value}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
