# Understanding Compound Components

Compound components work together as a cohesive unit while maintaining individual responsibilities. Think of them like HTML's `<select>` and `<option>` elements - they are separate components that work together to create sophisticated functionality.

Instead of this monolithic approach:

**`components/ui/my-table.tsx`**

```tsx
<DataTable
  data={data}
  columns={columns}
  pagination={true}
  sorting={true}
  filtering={true}
  actions={["edit", "delete"]}
  rowSelection={true}
  // ... 20+ more props
/>
```

We can use compound components for clarity:

**`components/ui/my-table.tsx`**

```tsx
<DataTable.Root data={data}>
  <DataTable.Toolbar>
    <DataTable.Search />
    <DataTable.Filter />
    <DataTable.Actions />
  </DataTable.Toolbar>

  <DataTable.Content>
    <DataTable.Header>
      <DataTable.Column sortable>Name</DataTable.Column>
      <DataTable.Column sortable>Date</DataTable.Column>
      <DataTable.Column>Actions</DataTable.Column>
    </DataTable.Header>

    <DataTable.Body>
      {data.map((row) => (
        <DataTable.Row key={row.id} data={row}>
          <DataTable.Cell>{row.name}</DataTable.Cell>
          <DataTable.Cell>{row.date}</DataTable.Cell>
          <DataTable.Cell>
            <DataTable.RowActions row={row} />
          </DataTable.Cell>
        </DataTable.Row>
      ))}
    </DataTable.Body>
  </DataTable.Content>

  <DataTable.Pagination />
</DataTable.Root>
```

This gives you:

- **Flexibility**: Easy to include or exclude specific functionality
- **Maintainability**: Props are distributed across relevant components
- **Developer Experience**: Clear visual structure and better IntelliSense
- **Scalability**: Handles simple to complex use cases naturally

## When to Use Compound Components

Consider compound components when you have:

- Complex components with many configuration options
- Multiple distinct UI areas that can be composed differently
- Functionality that might be optional or conditionally rendered
- Components that will be used in various configurations across your app

## Building a Sophisticated Card System

Let's build a comprehensive card system that demonstrates advanced compound component patterns. We'll break this down into logical sections to understand each piece.

### Step 1: Context and Foundation

First, we establish the shared context that allows our compound components to communicate. We'll do this by creating a context object that will be used to share state between components, then export that in the form of a hook.

**`components/ui/card-system.tsx`**

```tsx
"use client";

import * as React from "react";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Minimize2, Maximize2, X } from "lucide-react";

// Context for sharing state between compound components
interface CardContextValue {
  isCollapsible: boolean;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isExpandable: boolean;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  isDismissible: boolean;
  onDismiss?: () => void;
  variant: "default" | "outline" | "ghost";
  size: "default" | "sm" | "lg";
}

const CardContext = createContext<CardContextValue | null>(null);

const useCardContext = () => {
  const context = useContext(CardContext);
  if (!context) {
    throw new Error("Card compound components must be used within Card.Root");
  }
  return context;
};
```

The context pattern allows child components to access shared state without prop drilling. This is essential for compound components to feel unified while remaining compositional.

### Step 2: Root Component with State Management

The root component manages all shared state and provides the context. We can also call this component the "Provider" because it provides the context to all child components.

```tsx
// Root component that provides context and manages state
interface CardRootProps {
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  expandable?: boolean;
  defaultExpanded?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

function CardRoot({
  children,
  className,
  collapsible = false,
  defaultCollapsed = false,
  expandable = false,
  defaultExpanded = false,
  dismissible = false,
  onDismiss,
  variant = "default",
  size = "default",
  ...props
}: CardRootProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  const contextValue: CardContextValue = {
    isCollapsible: collapsible,
    isCollapsed,
    setIsCollapsed,
    isExpandable: expandable,
    isExpanded,
    setIsExpanded,
    isDismissible: dismissible,
    onDismiss,
    variant,
    size,
  };

  /* Variant and size styling configurations */
  const variants = {
    default: "border bg-card text-card-foreground shadow-sm",
    outline: "border-2 border-border bg-background",
    ghost: "border-0 bg-transparent shadow-none",
  };

  const sizes = {
    default: "p-6",
    sm: "p-4",
    lg: "p-8",
  };

  return (
    <CardContext.Provider value={contextValue}>
      <div
        className={cn(
          "rounded-lg transition-all duration-200 ease-in-out",
          variants[variant],
          sizes[size],
          isExpanded && "fixed inset-4 z-50 overflow-auto",
          isCollapsed && "py-4",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </CardContext.Provider>
  );
}
CardRoot.displayName = "Card.Root";
```

We use local state for UI interactions (collapse/expand) rather than requiring external state management. This keeps the component self-contained while allowing override through props.

### Step 3: Interactive Header Component

The header component demonstrates how compound components can have sophisticated built-in functionality. It uses the context to determine if it should render the collapse/expand and dismiss controls.

```tsx
// Header component with built-in controls
interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

function CardHeader({
  children,
  className,
  actions,
  ...props
}: CardHeaderProps) {
  const {
    isCollapsible,
    isCollapsed,
    setIsCollapsed,
    isExpandable,
    isExpanded,
    setIsExpanded,
    isDismissible,
    onDismiss,
  } = useCardContext();

  const hasControls = isCollapsible || isExpandable || isDismissible;

  return (
    <div
      className={cn(
        "flex items-center justify-between space-y-0 pb-2",
        className,
      )}
      {...props}
    >
      <div className="flex-1">{children}</div>

      {(actions || hasControls) && (
        <div className="flex items-center gap-2">
          {actions}
          {hasControls && (
            <div className="flex items-center">
              {/* Collapse/expand and dismiss controls implementation */}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
CardHeader.displayName = "Card.Header";
```

The header automatically includes controls based on the root component's configuration, but allows custom actions to be injected.

### Step 4: Content Management Components

The remaining components handle content display and state-aware rendering:

```tsx
// Content components that respond to context state
function CardContent({
  children,
  className,
  forceVisible = false,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  forceVisible?: boolean;
}) {
  const { isCollapsed, size } = useCardContext();

  if (isCollapsed && !forceVisible) {
    return null;
  }

  return (
    <div className={cn("p-6 pt-0", className)} {...props}>
      {children}
    </div>
  );
}

// Export the compound component
export const Card = {
  Root: CardRoot,
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
  Status: CardStatus,
};
```

Components like `CardContent` and `CardFooter` automatically hide when the card is collapsed, but provide override options for edge cases.

## Practical Usage Examples

### Simple Information Card

```tsx
function SimpleCard() {
  return (
    <Card.Root className="max-w-md">
      <Card.Header>
        <Card.Title>Project Status</Card.Title>
        <Card.Description>Current project health overview</Card.Description>
      </Card.Header>

      <Card.Content>
        <Card.Status status="success" label="All systems operational" />
        <p className="mt-2 text-sm">
          All components are functioning normally and performance metrics are
          within expected ranges.
        </p>
      </Card.Content>
    </Card.Root>
  );
}
```

### Interactive Dashboard Card

```tsx
function DashboardCard() {
  return (
    <Card.Root
      collapsible
      expandable
      dismissible
      onDismiss={() => console.log("Card dismissed")}
      className="max-w-lg"
    >
      <Card.Header
        actions={
          <Button variant="outline" size="sm">
            Refresh
          </Button>
        }
      >
        <div>
          <Card.Title>Real-time Analytics</Card.Title>
          <Card.Description>Live performance metrics</Card.Description>
        </div>
      </Card.Header>

      <Card.Content>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">1,234</div>
              <div className="text-sm text-muted-foreground">Active Users</div>
            </div>
          </div>
          <Card.Status status="success" label="System healthy" />
        </div>
      </Card.Content>

      <Card.Footer>
        <Button variant="outline" className="w-full">
          View Details
        </Button>
      </Card.Footer>
    </Card.Root>
  );
}
```

## Advanced Composition Patterns

### Performance Optimization

Split contexts to prevent unnecessary re-renders:

```tsx
const CardStateContext = createContext<{
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}>({} as any);

const CardConfigContext = createContext<{
  variant: string;
  size: string;
  isCollapsible: boolean;
  isExpandable: boolean;
  isDismissible: boolean;
}>({} as any);
```

Separating frequently changing state from static configuration prevents unnecessary re-renders of child components.

## TypeScript Best Practices

Ensure your compound components are fully type-safe:

```tsx
// Type-safe compound component interface
interface CardComponent {
  Root: React.ComponentType<CardRootProps>;
  Header: React.ComponentType<CardHeaderProps>;
  // ... rest of component type definitions ...
}

export const Card: CardComponent = {
  Root: CardRoot,
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
  Status: CardStatus,
} as const;
```

## Testing Strategies

```tsx
describe("Card Compound Component", () => {
  it("should handle collapsible functionality", () => {
    render(
      <Card.Root collapsible data-testid="card-root">
        <Card.Header>
          <Card.Title>Test Card</Card.Title>
        </Card.Header>
        <Card.Content data-testid="card-content">
          <p>Content that should hide when collapsed</p>
        </Card.Content>
      </Card.Root>,
    );

    expect(screen.getByTestId("card-content")).toBeInTheDocument();

    const collapseButton = screen.getByRole("button");
    fireEvent.click(collapseButton);

    expect(screen.queryByTestId("card-content")).not.toBeInTheDocument();
  });
});
```
