import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideProps } from "lucide-react";

import { cn } from "@/utils/cn";

type IconType = React.ForwardRefExoticComponent<
  Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>
>;

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#1e7dbf] text-white shadow hover:bg-[#1a6da8] active:bg-[#165d91]",
        destructive:
          "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800",
        outline:
          "border border-blue-200 bg-white text-gray-900 shadow-sm hover:bg-blue-50 hover:text-blue-900 active:bg-blue-100",
        secondary:
          "bg-blue-50 text-blue-900 shadow-sm hover:bg-blue-100 active:bg-blue-200",
        ghost: "text-gray-700 hover:bg-blue-50 hover:text-blue-900 active:bg-blue-100",
        icon: "p-0",
        link: "text-[#1e7dbf] underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-9 px-4 gap-2",
        sm: "h-8 rounded-md px-3 text-xs gap-2",
        lg: "h-10 rounded-md px-6 gap-2",
        icon: "h-9 w-9 p-0",
      },
    },
    compoundVariants: [
      {
        variant: ["default", "outline", "secondary"],
        size: "default",
        className: "py-2"
      },
      {
        variant: ["ghost"],
        size: "default",
        className: "px-3 py-1.5"
      },
      {
        variant: ["ghost"],
        size: "sm",
        className: "px-2 py-1"
      },
      {
        variant: ["ghost"],
        size: "lg",
        className: "px-4 py-2"
      },
      {
        variant: ["icon"],
        className: "[&>svg]:m-auto"
      }
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  icon?: IconType;
  iconPosition?: 'left' | 'right';
  iconClassName?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    asChild = false, 
    children,
    icon: Icon,
    iconPosition = 'left',
    ...props 
  }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    if (asChild) {
      // When asChild is true, we want to clone the child and add our classes
      const child = React.Children.only(children) as React.ReactElement;
      return React.cloneElement(child, {
        className: cn(
          buttonVariants({ variant, size }),
          'inline-flex items-center',
          className,
          child.props.className
        ),
        ref: ref,
        ...props
      });
    }
    
    // Regular button with icon and text
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size }),
          'inline-flex items-center',
          className
        )}
        ref={ref}
        {...props}
      >
        {Icon && iconPosition === 'left' && (
          <Icon className={cn("h-4 w-4 flex-shrink-0", children && 'mr-1.5')} />
        )}
        {children}
        {Icon && iconPosition === 'right' && (
          <Icon className={cn("h-4 w-4 flex-shrink-0", children && 'ml-1.5')} />
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
