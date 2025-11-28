import * as React from "react"
import { cn } from "@/lib/utils"
import { useVirtualKeyboard } from "@/contexts/VirtualKeyboardContext"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  showVirtualKeyboard?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, showVirtualKeyboard = true, onFocus, value, onChange, ...props }, ref) => {
    const { openKeyboard } = useVirtualKeyboard();
    
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      // Allow physical keyboard to work - don't prevent default focus
      // Only show virtual keyboard for text inputs, not for file inputs, etc.
      if (
        showVirtualKeyboard && 
        type !== 'file' && 
        type !== 'checkbox' && 
        type !== 'radio' &&
        type !== 'hidden'
      ) {
        // Show virtual keyboard as an overlay option (doesn't block physical keyboard)
        // Don't prevent default - let the input receive focus normally so physical keyboard works
        const inputType = type === 'number' ? 'numeric' : 'text';
        openKeyboard(
          (newValue) => {
            // Update the input field value directly when virtual keyboard is used
            if (inputRef.current) {
              inputRef.current.value = newValue;
              // Create a synthetic event to trigger onChange
              const syntheticEvent = {
                target: { value: newValue },
                currentTarget: { value: newValue },
              } as React.ChangeEvent<HTMLInputElement>;
              onChange?.(syntheticEvent);
            }
          },
          inputType,
          String(value || inputRef.current?.value || '')
        );
      }
      onFocus?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Physical keyboard input - update normally
      onChange?.(e);
      // Note: Virtual keyboard will sync when it reopens or when user clicks on it
      // Physical keyboard and virtual keyboard can work simultaneously
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
        onChange={handleChange}
        onKeyDown={(e) => {
          // Ensure keyboard events work even when virtual keyboard is open
          // Don't prevent default - let the input handle it normally
          props.onKeyDown?.(e);
        }}
        onKeyPress={(e) => {
          // Ensure keyboard events work
          props.onKeyPress?.(e);
        }}
        value={value}
        style={{ 
          ...props.style,
          // Ensure input is always accessible for keyboard events
          zIndex: showVirtualKeyboard ? 60 : undefined,
          position: showVirtualKeyboard ? 'relative' : undefined,
        }}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
