import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { label: string };

/** Round header control with an accessible name. */
export const IconAction = forwardRef<HTMLButtonElement, Props>(({ label, className, children, ...rest }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    title={label}
    className={cn(
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition active:scale-95 hover:bg-accent disabled:opacity-35 disabled:hover:bg-transparent [&_svg]:h-[20px] [&_svg]:w-[20px]",
      className,
    )}
    {...rest}
  >
    {children}
  </button>
));
IconAction.displayName = "IconAction";
