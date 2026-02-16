import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-lg border-2 border-input bg-background px-3 py-2 text-right text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm hover:shadow",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-60" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4 rotate-180" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", sideOffset = 4, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      align="start"
      position={position}
      sideOffset={sideOffset}
      className={cn(
        "relative z-50 max-h-80 min-w-[8rem] overflow-hidden rounded-lg border-2 border-input bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 w-[--radix-select-trigger-width]",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className,
      )}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn("p-1", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]")}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-right text-xs font-medium text-muted-foreground", className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-right text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

type LegacySelectProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  dir?: "rtl" | "ltr";
};

const LEGACY_EMPTY_VALUE = "__radix_empty__";

type OptionLikeElement = React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>;

function isOptionElement(child: React.ReactNode): child is OptionLikeElement {
  return React.isValidElement(child) && child.type === "option";
}

function extractOptionElements(children: React.ReactNode): OptionLikeElement[] {
  const result: OptionLikeElement[] = [];
  React.Children.forEach(children, (child) => {
    if (isOptionElement(child)) {
      result.push(child);
      return;
    }
    if (React.isValidElement(child) && child.props && "children" in child.props) {
      result.push(...extractOptionElements((child.props as { children?: React.ReactNode }).children));
    }
  });
  return result;
}

const Select = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  LegacySelectProps & React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>
>(({ children, value, defaultValue, onChange, onValueChange, className, placeholder, disabled, id, dir, ...props }, ref) => {
  const optionChildren = extractOptionElements(children);
  const isLegacyOptionUsage = optionChildren.length > 0;

  if (isLegacyOptionUsage) {
    const currentValue = typeof value === "string" ? (value === "" ? LEGACY_EMPTY_VALUE : value) : undefined;
    const currentDefaultValue =
      typeof defaultValue === "string" ? (defaultValue === "" ? LEGACY_EMPTY_VALUE : defaultValue) : undefined;
    const effectivePlaceholder =
      placeholder ||
      optionChildren.find((option) => option.props.value === "")?.props.children?.toString() ||
      "בחר...";

    return (
      <SelectPrimitive.Root
        dir={dir ?? "rtl"}
        value={currentValue}
        defaultValue={currentDefaultValue}
        onValueChange={(nextValue) => {
          const normalizedValue = nextValue === LEGACY_EMPTY_VALUE ? "" : nextValue;
          onValueChange?.(normalizedValue);
          onChange?.({ target: { value: normalizedValue } });
        }}
        disabled={disabled}
        {...props}
      >
        <SelectTrigger ref={ref} id={id} className={className}>
          <SelectValue placeholder={effectivePlaceholder} />
        </SelectTrigger>
        <SelectContent className="w-[--radix-select-trigger-width]">
          {optionChildren
            .filter((option) => String(option.props.value ?? "") === "")
            .slice(0, 1)
            .map((option) => (
              <SelectItem key={LEGACY_EMPTY_VALUE} value={LEGACY_EMPTY_VALUE} disabled={Boolean(option.props.disabled)}>
                {option.props.children ?? effectivePlaceholder}
              </SelectItem>
            ))}
          {optionChildren
            .filter((option) => String(option.props.value ?? "") !== "")
            .map((option) => (
              <SelectItem
                key={String(option.props.value)}
                value={String(option.props.value)}
                disabled={Boolean(option.props.disabled)}
              >
                {option.props.children}
              </SelectItem>
            ))}
        </SelectContent>
      </SelectPrimitive.Root>
    );
  }

  return (
    <SelectPrimitive.Root
      dir={dir ?? "rtl"}
      value={typeof value === "string" ? value : undefined}
      defaultValue={typeof defaultValue === "string" ? defaultValue : undefined}
      onValueChange={onValueChange}
      disabled={disabled}
      {...props}
    >
      {children}
    </SelectPrimitive.Root>
  );
});
Select.displayName = "Select";

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
};
