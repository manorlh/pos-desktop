import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { useVirtualKeyboard } from "@/contexts/VirtualKeyboardContext"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  const { isOpen: isKeyboardOpen } = useVirtualKeyboard();
  
  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // If clicking on the keyboard itself, don't prevent - let it handle the click
    if (target.closest('[data-virtual-keyboard]')) {
      // Don't prevent - let keyboard handle the click
      return;
    }
    // If clicking on overlay and keyboard is open, prevent closing dialog
    if (isKeyboardOpen && e.target === e.currentTarget) {
      e.preventDefault();
      return;
    }
    props.onPointerDown?.(e);
  };
  
  return (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
        "fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        isKeyboardOpen && "pointer-events-none",
      className
    )}
      onPointerDown={handlePointerDown}
    {...props}
  />
  );
})
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { isOpen: isKeyboardOpen, keyboardHeight } = useVirtualKeyboard();
  
  // Prevent dialog from closing when clicking on the virtual keyboard or select dropdown
  const handleInteractOutside = (e: Event) => {
    const target = e.target as HTMLElement;
    // Check if the click is on the virtual keyboard
    if (target.closest('[data-virtual-keyboard]')) {
      e.preventDefault();
      return;
    }
    // Check if the click is on a select dropdown (Radix UI Select)
    if (target.closest('[data-radix-popper-content-wrapper]') || 
        target.closest('[data-radix-select-content]') ||
        target.closest('[role="listbox"]')) {
      // Don't prevent - allow select to work normally
      return;
    }
    // If keyboard is open, prevent closing dialog on outside clicks
    if (isKeyboardOpen) {
      e.preventDefault();
      return;
    }
    // Allow default behavior for other outside clicks when keyboard is closed
    if (props.onInteractOutside) {
      props.onInteractOutside(e);
    }
  };
  
  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
          "fixed left-[50%] z-[101] grid w-full max-w-lg translate-x-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-y-auto transition-all",
        className
      )}
        style={{
          top: keyboardHeight > 0 ? 'auto' : '50%',
          bottom: keyboardHeight > 0 ? `calc(${keyboardHeight}px + 1rem)` : 'auto',
          transform: keyboardHeight > 0 ? 'translateX(-50%)' : 'translate(-50%, -50%)',
          maxHeight: keyboardHeight > 0 ? `calc(100vh - ${keyboardHeight}px - 2rem)` : 'calc(100vh - 2rem)',
          transition: 'bottom 0.3s ease-out, max-height 0.3s ease-out, transform 0.3s ease-out',
        }}
        onInteractOutside={handleInteractOutside}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
