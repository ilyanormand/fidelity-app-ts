import { useState, useCallback } from "react";
import { Popover, Button, ActionList } from "@shopify/polaris";

interface CustomerSearchProps {
    label: string;
    items: { content: string; onAction?: () => void }[];
}

export function CustomerSearch({ label, items }: CustomerSearchProps) {
    const [active, setActive] = useState(false);

    const toggle = useCallback(() => setActive((a) => !a), []);

    const activator = (
        <Button disclosure onClick={toggle} variant="primary">
            {label}
        </Button>
    );

    return (
        <Popover
            active={active}
            activator={activator}
            onClose={toggle}
            autofocusTarget="first-node"
        >
            <ActionList items={items} />
        </Popover>
    );
}
