import "@shopify/ui-extensions/preact";

export default function Login({ shopify }) {
    return (
        <s-stack gap="base">

            <s-text type="strong">
                {shopify.i18n.translate("loyaltyProgram")}
            </s-text>

            <s-banner tone="info">
                <s-text>{shopify.i18n.translate("errors.joinAccount")}</s-text>
            </s-banner>

            <s-button
                variant="primary"
                href="/account/login"
                tone="neutral"
            >
                {shopify.i18n.translate("components.login")}
            </s-button>

        </s-stack>
    );
}